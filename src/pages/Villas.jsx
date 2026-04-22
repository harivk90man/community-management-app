import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'

// ─── constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const EMPTY_FORM = {
  villa_number:    '',
  owner_name:      '',
  email:           '',
  phone:           '',
  is_board_member: false,
  board_role:      '',
  is_rented:       false,
  tenant_name:     '',
  tenant_phone:    '',
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Villas() {
  const { role } = useAuth()

  if (role === 'board') return <BoardView />
  return <BoardView readOnly />
}

// ─── board view ───────────────────────────────────────────────────────────────

function BoardView({ readOnly = false }) {
  const [villas,     setVillas]     = useState([])
  const [villaUsers, setVillaUsers] = useState({}) // { villa_id: [user, ...] }
  const [search,     setSearch]     = useState('')
  const [page,       setPage]       = useState(1)
  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [showUsers,  setShowUsers]  = useState(null) // villa id to show user management

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const [villaRes, usersRes] = await Promise.all([
      supabase.from('villas').select('*').order('villa_number', { ascending: true }),
      supabase.from('villa_users').select('*').order('is_primary', { ascending: false }),
    ])
    if (villaRes.error) throw villaRes.error
    if (usersRes.error) throw usersRes.error
    setVillas(villaRes.data ?? [])
    const grouped = {}
    for (const u of (usersRes.data ?? [])) {
      if (!grouped[u.villa_id]) grouped[u.villa_id] = []
      grouped[u.villa_id].push(u)
    }
    setVillaUsers(grouped)
  }, [])

  // Reset to page 1 whenever search changes
  useEffect(() => { setPage(1) }, [search])

  async function toggleActive(v) {
    setTogglingId(v.id)
    try {
      const { error } = await supabase.from('villas').update({ is_active: !v.is_active }).eq('id', v.id)
      if (error) throw error
      setVillas(prev => prev.map(x => x.id === v.id ? { ...x, is_active: !x.is_active } : x))
    } catch { /* silently fail */ }
    setTogglingId(null)
  }

  function openAdd()   { setEditing(null); setShowForm(true) }
  function openEdit(v) { setEditing(v);    setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  function onSaved(saved, isNew, savedUsers) {
    if (isNew) {
      setVillas(prev => [...prev, saved].sort((a, b) =>
        a.villa_number.localeCompare(b.villa_number, undefined, { numeric: true })
      ))
    } else {
      setVillas(prev => prev.map(x => x.id === saved.id ? saved : x))
    }
    if (savedUsers) {
      setVillaUsers(prev => ({ ...prev, [saved.id]: savedUsers }))
    }
    closeForm()
  }

  const filtered = villas.filter(v => {
    const q = search.toLowerCase()
    const users = villaUsers[v.id] ?? []
    return (
      v.villa_number.toLowerCase().includes(q) ||
      v.owner_name.toLowerCase().includes(q) ||
      users.some(u => u.name.toLowerCase().includes(q))
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="p-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Villas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '…' : `${villas.length} villa${villas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchInput value={search} onChange={setSearch} />
          {!readOnly && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                         text-white text-sm font-semibold rounded-lg transition shrink-0">
              <PlusIcon className="w-4 h-4" />
              Add Villa
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <CardSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState search={search} onClear={() => setSearch('')} onAdd={openAdd} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paged.map(v => (
              <VillaCard
                key={v.id}
                villa={v}
                users={villaUsers[v.id] ?? []}
                readOnly={readOnly}
                onEdit={() => openEdit(v)}
                onToggle={() => toggleActive(v)}
                toggling={togglingId === v.id}
                onManageUsers={() => setShowUsers(v.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
              <p className="text-sm text-gray-500">
                Page <span className="font-medium text-gray-700">{safePage}</span> of{' '}
                <span className="font-medium text-gray-700">{totalPages}</span>
                <span className="text-gray-400"> · {filtered.length} villas</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={safePage === 1}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600
                             border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50
                             transition disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeftIcon className="w-4 h-4" /> Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={safePage === totalPages}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600
                             border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50
                             transition disabled:opacity-40 disabled:cursor-not-allowed">
                  Next <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add / Edit modal — board only */}
      {!readOnly && showForm && (
        <VillaFormModal editing={editing} onSaved={onSaved} onClose={closeForm} />
      )}

      {/* Manage Users modal — board only */}
      {!readOnly && showUsers && (
        <ManageUsersModal
          villa={villas.find(v => v.id === showUsers)}
          users={villaUsers[showUsers] ?? []}
          onClose={() => setShowUsers(null)}
          onUsersChanged={(updatedUsers) => {
            setVillaUsers(prev => ({ ...prev, [showUsers]: updatedUsers }))
          }}
        />
      )}
    </div>
  )
}

// ─── villa card ────────────────────────────────────────────────────────────────

function VillaCard({ villa: v, users = [], readOnly, onEdit, onToggle, toggling, onManageUsers }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm
                    hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
                    flex flex-col overflow-hidden">

      {/* Top row: villa number + status indicator */}
      <div className="flex items-start justify-between p-5 pb-3">
        <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center
                        shadow-sm shrink-0">
          <span className="text-white font-black text-sm leading-none tracking-tight">
            {v.villa_number}
          </span>
        </div>
        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${
          v.is_active
            ? 'bg-green-50 text-green-700'
            : 'bg-gray-100 text-gray-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${v.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
          {v.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Owner name */}
      <div className="px-5 pb-1">
        <h3 className="font-bold text-gray-900 text-base leading-snug truncate">{v.owner_name}</h3>
      </div>

      {/* Registered users */}
      <div className="px-5 py-3 space-y-1.5">
        {users.length > 0 ? users.map(u => (
          <div key={u.id} className="flex items-center gap-2 min-w-0">
            <UserIcon className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            <span className="text-sm text-gray-600 truncate">
              {u.name}
              {u.is_primary && (
                <span className="ml-1 text-xs text-green-600 font-medium">(Primary)</span>
              )}
            </span>
          </div>
        )) : (
          <div className="flex items-center gap-2 min-w-0">
            <UserIcon className="w-3.5 h-3.5 shrink-0 text-gray-300" />
            <span className="text-sm text-gray-400 italic">No users registered</span>
          </div>
        )}
      </div>

      {/* Badges row */}
      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
        {v.is_board_member ? (
          <span className="px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 rounded-full">
            {v.board_role || 'Board Member'}
          </span>
        ) : (
          <span className="px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
            Resident
          </span>
        )}
        {v.is_rented ? (
          <span className="px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
            Rented
          </span>
        ) : (
          <span className="px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full">
            Owner-occupied
          </span>
        )}
        <span className="px-2.5 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded-full">
          {users.length} user{users.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tenant name (if rented) */}
      {v.is_rented && v.tenant_name && (
        <div className="px-5 pb-3">
          <p className="text-xs text-gray-400">
            Tenant:{' '}
            <span className="text-gray-600 font-medium">{v.tenant_name}</span>
            {v.tenant_phone && (
              <span className="text-gray-400"> · {v.tenant_phone}</span>
            )}
          </p>
        </div>
      )}


      {/* Push actions to bottom */}
      <div className="flex-1" />

      {/* Action buttons — board only */}
      {!readOnly && (
        <div className="grid grid-cols-3 gap-2 px-5 py-4 border-t border-gray-50">
          <button onClick={onEdit}
            className="py-2 text-xs font-semibold text-gray-600 bg-gray-50
                       hover:bg-gray-100 rounded-lg transition">
            Edit
          </button>
          <button onClick={onManageUsers}
            className="py-2 text-xs font-semibold text-purple-600 bg-purple-50
                       hover:bg-purple-100 rounded-lg transition">
            Users
          </button>
          <button onClick={onToggle} disabled={toggling}
            className={`py-2 text-xs font-semibold rounded-lg transition disabled:opacity-50 ${
              v.is_active
                ? 'text-red-600 bg-red-50 hover:bg-red-100'
                : 'text-green-600 bg-green-50 hover:bg-green-100'
            }`}>
            {toggling ? '…' : v.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── add / edit modal ─────────────────────────────────────────────────────────

function VillaFormModal({ editing, onSaved, onClose }) {
  const isEdit = Boolean(editing)

  const [form, setForm]     = useState(isEdit ? { ...editing } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = {
      villa_number:    form.villa_number.trim(),
      owner_name:      form.owner_name.trim(),
      email:           form.email.trim()        || null,
      phone:           form.phone.trim()        || null,
      is_board_member: form.is_board_member,
      board_role:      form.is_board_member ? (form.board_role.trim() || null) : null,
      is_rented:       form.is_rented,
      tenant_name:     form.is_rented ? (form.tenant_name.trim() || null) : null,
      tenant_phone:    form.is_rented ? (form.tenant_phone.trim() || null) : null,
    }

    try {
      let villaData
      if (isEdit) {
        const { data, error: err } = await supabase
          .from('villas').update(payload).eq('id', editing.id).select().single()
        if (err) throw err
        villaData = data

        // Update or create the primary villa_user
        const { data: existingPrimary } = await supabase
          .from('villa_users').select('id').eq('villa_id', editing.id).eq('is_primary', true).maybeSingle()
        const vuPayload = { name: payload.owner_name, email: payload.email, phone: payload.phone, is_primary: true, villa_id: editing.id }
        if (existingPrimary) {
          await supabase.from('villa_users').update(vuPayload).eq('id', existingPrimary.id)
        } else {
          await supabase.from('villa_users').insert(vuPayload)
        }
      } else {
        const { data, error: err } = await supabase
          .from('villas').insert({ ...payload, is_active: true }).select().single()
        if (err) throw err
        villaData = data

        // Auto-create primary villa_user
        await supabase.from('villa_users').insert({
          villa_id: villaData.id, name: payload.owner_name, email: payload.email, phone: payload.phone, is_primary: true,
        })
      }

      // Fetch updated users for this villa
      const { data: updatedUsers } = await supabase
        .from('villa_users').select('*').eq('villa_id', villaData.id).order('is_primary', { ascending: false })
      onSaved(villaData, !isEdit, updatedUsers ?? [])
    } catch (err) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={saving ? undefined : onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh]
                      overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Villa' : 'Add Villa'}
          </h2>
          <button onClick={saving ? undefined : onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Villa Number" required>
              <input type="text" required value={form.villa_number}
                onChange={e => set('villa_number', e.target.value)}
                placeholder="e.g. A-12" className={inputCls} />
            </Field>
            <Field label="Owner Name" required>
              <input type="text" required value={form.owner_name}
                onChange={e => set('owner_name', e.target.value)}
                placeholder="Full name" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <input type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="email@example.com" className={inputCls} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+91 98765 43210" className={inputCls} />
            </Field>
          </div>

          <div className="space-y-3">
            <Toggle id="is_board_member" label="Board Member"
              checked={form.is_board_member} onChange={v => set('is_board_member', v)} />
            {form.is_board_member && (
              <Field label="Board Role">
                <input type="text" value={form.board_role}
                  onChange={e => set('board_role', e.target.value)}
                  placeholder="e.g. President, Treasurer" className={inputCls} />
              </Field>
            )}
          </div>

          <div className="space-y-3">
            <Toggle id="is_rented" label="Rented Out"
              checked={form.is_rented} onChange={v => set('is_rented', v)} />
            {form.is_rented && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tenant Name">
                  <input type="text" value={form.tenant_name}
                    onChange={e => set('tenant_name', e.target.value)}
                    placeholder="Tenant full name" className={inputCls} />
                </Field>
                <Field label="Tenant Phone">
                  <input type="tel" value={form.tenant_phone}
                    onChange={e => set('tenant_phone', e.target.value)}
                    placeholder="+91 98765 43210" className={inputCls} />
                </Field>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900
                         border border-gray-200 hover:border-gray-300 rounded-lg transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                         disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition">
              {saving && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Villa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── manage users modal ──────────────────────────────────────────────────────

function ManageUsersModal({ villa, users, onClose, onUsersChanged }) {
  const [list, setList] = useState(users)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')
  const [resettingId, setResettingId] = useState(null)
  const [tempPassword, setTempPassword] = useState('')
  const [resetResult, setResetResult] = useState(null) // { userId, password } to show

  async function handleAdd(e) {
    e.preventDefault()
    if (!addName.trim()) return
    setError('')
    setSaving(true)
    try {
      const { data, error: err } = await supabase.from('villa_users').insert({
        villa_id: villa.id,
        name: addName.trim(),
        email: addEmail.trim() || null,
        phone: addPhone.trim() || null,
        is_primary: false,
      }).select().single()
      if (err) throw err
      const updated = [...list, data]
      setList(updated)
      onUsersChanged(updated)
      setAddName(''); setAddEmail(''); setAddPhone('')
    } catch (err) {
      setError(err.message ?? 'Failed to add user.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(userId) {
    const user = list.find(u => u.id === userId)
    if (user?.is_primary) return
    setDeleting(userId)
    try {
      const { error: err } = await supabase.from('villa_users').delete().eq('id', userId)
      if (err) throw err
      const updated = list.filter(u => u.id !== userId)
      setList(updated)
      onUsersChanged(updated)
    } catch { /* silently fail */ }
    setDeleting(null)
  }

  async function handleResetPassword(u) {
    if (!tempPassword.trim()) return
    setResettingId(u.id)
    setError('')
    try {
      // Determine which RPC to call based on whether user has email or phone
      if (u.email) {
        const { error: err } = await supabase.rpc('admin_reset_password', {
          target_email: u.email,
          new_password: tempPassword.trim(),
        })
        if (err) throw err
      } else if (u.phone) {
        const digits = u.phone.replace(/\D/g, '')
        const { error: err } = await supabase.rpc('admin_reset_password_by_phone', {
          target_phone: digits,
          new_password: tempPassword.trim(),
        })
        if (err) throw err
      } else {
        throw new Error('User has no email or phone — cannot reset password.')
      }

      // Set force_password_change flag
      await supabase.from('villa_users').update({ force_password_change: true }).eq('id', u.id)

      setResetResult({ userId: u.id, password: tempPassword.trim() })
      setTempPassword('')
    } catch (err) {
      setError(err.message ?? 'Failed to reset password.')
    } finally {
      setResettingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh]
                      overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Villa {villa?.villa_number} — Users
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {list.length} registered user{list.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Existing users */}
          <div className="space-y-3">
            {list.map(u => (
              <div key={u.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.name}
                      {u.is_primary && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                          Primary
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {[u.email, u.phone].filter(Boolean).join(' · ') || 'No contact info'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => setResettingId(resettingId === u.id ? null : u.id)}
                      className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50
                                 rounded-lg transition text-xs font-medium">
                      <KeyIcon className="w-4 h-4" />
                    </button>
                    {!u.is_primary && (
                      <button
                        onClick={() => handleDelete(u.id)}
                        disabled={deleting === u.id}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50
                                   rounded-lg transition disabled:opacity-50">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Reset password inline form */}
                {resettingId === u.id && (
                  <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
                    {resetResult?.userId === u.id ? (
                      <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-xs font-medium text-green-700">Password reset! Temp password:</p>
                        <p className="text-sm font-mono font-bold text-green-900 mt-1 select-all">
                          {resetResult.password}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          Share this with the user. They'll be asked to change it on next login.
                        </p>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input type="text" value={tempPassword}
                          onChange={e => setTempPassword(e.target.value)}
                          placeholder="Enter temp password"
                          className={inputCls + ' text-xs'} />
                        <button onClick={() => handleResetPassword(u)}
                          disabled={!tempPassword.trim()}
                          className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300
                                     text-white text-xs font-semibold rounded-lg transition shrink-0">
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add new user form */}
          <form onSubmit={handleAdd} className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Add a user</p>
            <div className="grid grid-cols-1 gap-3">
              <input type="text" required value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="Name *" className={inputCls} />
              <div className="grid grid-cols-2 gap-3">
                <input type="email" value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  placeholder="Email" className={inputCls} />
                <input type="tel" value={addPhone}
                  onChange={e => setAddPhone(e.target.value)}
                  placeholder="Phone" className={inputCls} />
              </div>
            </div>
            <button type="submit" disabled={saving || !addName.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700
                         disabled:bg-purple-300 text-white text-sm font-semibold rounded-lg transition">
              {saving && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {saving ? 'Adding…' : 'Add User'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── resident view ───────────────────────────────────────────────────────────

function ResidentView({ villa }) {
  const [users, setUsers] = useState([])

  useEffect(() => {
    if (!villa) return
    supabase.from('villa_users').select('*').eq('villa_id', villa.id)
      .order('is_primary', { ascending: false })
      .then(({ data }) => setUsers(data ?? []))
  }, [villa?.id])

  if (!villa) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center py-24">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <BuildingIcon className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-gray-500 font-medium">No villa linked to your account.</p>
        <p className="text-sm text-gray-400 mt-1">Contact your association administrator.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">My Villa</h1>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-green-500 px-6 py-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <span className="text-white font-black text-xl">{villa.villa_number}</span>
          </div>
          <div>
            <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Villa</p>
            <p className="text-white font-bold text-lg leading-tight">{villa.owner_name}</p>
            {villa.is_board_member && (
              <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold
                               bg-white/20 text-white rounded-full">
                {villa.board_role || 'Board Member'}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          <Section title="Registered Users">
            {users.length > 0 ? users.map(u => (
              <div key={u.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">{u.name}</span>
                  {u.is_primary && (
                    <span className="ml-2 text-xs text-green-600 font-medium">(Primary)</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 truncate ml-2">
                  {[u.email, u.phone].filter(Boolean).join(' · ')}
                </span>
              </div>
            )) : (
              <DetailRow label="Users" value="—" />
            )}
          </Section>

          <Section title="Villa Details">
            <DetailRow label="Status" value={
              <Badge color={villa.is_active ? 'green' : 'gray'}
                     label={villa.is_active ? 'Active' : 'Inactive'} />
            } />
            <DetailRow label="Occupancy" value={
              <Badge color={villa.is_rented ? 'blue' : 'amber'}
                     label={villa.is_rented ? 'Rented' : 'Owner-occupied'} />
            } />
          </Section>

          {villa.is_rented && (
            <Section title="Tenant Details">
              <DetailRow label="Name"     value={villa.tenant_name  ?? '—'} />
              <DetailRow label="Phone"    value={villa.tenant_phone ?? '—'} />
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── shared components ────────────────────────────────────────────────────────

function SearchInput({ value, onChange }) {
  return (
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input type="search" value={value} onChange={e => onChange(e.target.value)}
        placeholder="Search villa or owner…"
        className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg
                   focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                   w-56 transition" />
    </div>
  )
}

function Toggle({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-green-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`} />
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  )
}

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}

function Badge({ color, label }) {
  const colors = { green: 'bg-green-100 text-green-700', gray: 'bg-gray-100 text-gray-500', blue: 'bg-blue-100 text-blue-700' }
  return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[color]}`}>{label}</span>
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 animate-pulse">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-full bg-gray-100" />
            <div className="h-5 w-16 bg-gray-100 rounded-full" />
          </div>
          <div className="h-4 w-3/4 bg-gray-100 rounded" />
          <div className="space-y-2">
            <div className="h-3.5 bg-gray-100 rounded" />
            <div className="h-3.5 bg-gray-100 rounded w-3/4" />
          </div>
          <div className="flex gap-1.5">
            <div className="h-5 w-20 bg-gray-100 rounded-full" />
            <div className="h-5 w-24 bg-gray-100 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
            <div className="h-8 bg-gray-100 rounded-lg" />
            <div className="h-8 bg-gray-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ search, onClear, onAdd }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <BuildingIcon className="w-7 h-7 text-gray-400" />
      </div>
      {search ? (
        <>
          <p className="text-gray-500 font-medium">No villas match "{search}"</p>
          <button onClick={onClear} className="mt-3 text-sm text-green-600 hover:underline">
            Clear search
          </button>
        </>
      ) : (
        <>
          <p className="text-gray-500 font-medium">No villas yet</p>
          <button onClick={onAdd}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition">
            <PlusIcon className="w-4 h-4" /> Add first villa
          </button>
        </>
      )}
    </div>
  )
}

// ─── style constants ──────────────────────────────────────────────────────────

const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`

// ─── icons ────────────────────────────────────────────────────────────────────

function PlusIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
function SearchIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" /></svg>
}
function XIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
}
function BuildingIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3
         M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a1 1 0 011-1h4a1 1 0 011 1v4" /></svg>
}
function MailIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
}
function PhoneIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
}
function ChevronLeftIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
}
function ChevronRightIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
}
function UserIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
}
function TrashIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
}
function KeyIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
}
