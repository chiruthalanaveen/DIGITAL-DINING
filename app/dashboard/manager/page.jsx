// --- Inside RestaurantDashboard component ---
const [managerList, setManagerList] = useState([])
const [managerName, setManagerName] = useState('')
const [managerUserId, setManagerUserId] = useState('')
const [managerPassword, setManagerPassword] = useState('')
const [managerPermissions, setManagerPermissions] = useState({
  view_orders: true,
  manage_kitchen: true,
  manage_menu: true,
  manage_offers: true,
  view_sales: true,
  manage_waiters: true,
  manage_kitchen_staff: true,
})
const [addingManager, setAddingManager] = useState(false)

// Fetch managers alongside staff
const fetchManagers = async () => {
  if (!restaurantId) return
  const { data } = await supabase
    .from('staff_users')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('role', 'manager')
    .order('created_at', { ascending: false })
  if (data) setManagerList(data)
}

useEffect(() => {
  if (authChecked && restaurantId) {
    fetchManagers()
  }
}, [authChecked, restaurantId])

const handleCreateManager = async (e) => {
  e.preventDefault()
  if (!managerName.trim() || !managerUserId.trim() || !managerPassword.trim()) {
    alert('Please fill out all manager credentials.')
    return
  }
  setAddingManager(true)
  try {
    const newManager = {
      restaurant_id: restaurantId,
      name: managerName.trim(),
      user_id: managerUserId.trim().toLowerCase(),
      password: managerPassword.trim(),
      pin: managerPassword.trim(),
      role: 'manager',
      is_active: true,
      permissions: managerPermissions,
      created_by: 'owner'
    }

    const { data, error } = await supabase
      .from('staff_users')
      .insert([newManager])
      .select()

    if (error) throw error

    alert('Manager account created successfully! 🎉')
    setManagerName('')
    setManagerUserId('')
    setManagerPassword('')
    if (data) setManagerList((prev) => [...data, ...prev])
  } catch (err) {
    alert('Failed to create manager account: ' + err.message)
  } finally {
    setAddingManager(false)
  }
}

const toggleManagerStatus = async (manager) => {
  const nextStatus = !manager.is_active
  const { error } = await supabase
    .from('staff_users')
    .update({ is_active: nextStatus })
    .eq('id', manager.id)

  if (error) {
    alert('Failed to update status: ' + error.message)
  } else {
    setManagerList((prev) =>
      prev.map((m) => (m.id === manager.id ? { ...m, is_active: nextStatus } : m))
    )
  }
}

const handleDeleteManager = async (managerId, name) => {
  if (!confirm(`Are you sure you want to remove manager "${name}"?`)) return
  const { error } = await supabase
    .from('staff_users')
    .delete()
    .eq('id', managerId)

  if (error) {
    alert('Failed to delete manager: ' + error.message)
  } else {
    setManagerList((prev) => prev.filter((m) => m.id !== managerId))
  }
}