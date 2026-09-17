"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function RestaurantManagerDashboard() {
  const [waiters, setWaiters] = useState([]);
  const [kitchenStaff, setKitchenStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // Replace with auth session or context providing restaurant_id
  const restaurantId = 'restaurant-123';

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setLoading(true);

    const { data: waiterData, error: wError } = await supabase
      .from('staff_users')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'waiter');

    const { data: kitchenData, error: kError } = await supabase
      .from('staff_users')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'kitchen');

    if (wError || kError) {
      // Handle errors ideally with UI alerts
      alert("Error loading staff data");
    } else {
      setWaiters(waiterData);
      setKitchenStaff(kitchenData);
    }

    setLoading(false);
  }

  // Example: toggle active status for waiter or kitchen user
  async function toggleActiveStatus(userId, currentStatus) {
    const { error } = await supabase
      .from('staff_users')
      .update({ is_active: !currentStatus })
      .eq('id', userId);

    if (error) {
      alert("Failed to update status");
    } else {
      loadStaff(); // refresh staff lists
    }
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-semibold mb-6">Restaurant Manager Dashboard</h1>

      {loading ? (
        <div>Loading staff data…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Waiter Staff Management */}
          <section className="bg-white p-4 rounded shadow">
            <h2 className="font-bold text-xl mb-4">Waiter Management</h2>
            {waiters.length === 0 ? (
              <p>No waiters found.</p>
            ) : (
              <ul className="space-y-2">
                {waiters.map(waiter => (
                  <li key={waiter.id} className="flex justify-between items-center border-b py-2">
                    <span>{waiter.name} ({waiter.user_id})</span>
                    <div className="space-x-2">
                      <button 
                        className="text-blue-600 hover:underline"
                        onClick={() => alert('Implement waiter edit')}
                      >
                        Edit
                      </button>
                      <button
                        className={`px-2 py-1 rounded text-white ${
                          waiter.is_active ? 'bg-red-600' : 'bg-green-600'
                        }`}
                        onClick={() => toggleActiveStatus(waiter.id, waiter.is_active)}
                      >
                        {waiter.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              onClick={() => alert('Open create waiter form')}
            >
              Create Waiter
            </button>
          </section>

          {/* Kitchen Staff Management */}
          <section className="bg-white p-4 rounded shadow">
            <h2 className="font-bold text-xl mb-4">Kitchen Staff Management</h2>
            {kitchenStaff.length === 0 ? (
              <p>No kitchen staff found.</p>
            ) : (
              <ul className="space-y-2">
                {kitchenStaff.map(staff => (
                  <li key={staff.id} className="flex justify-between items-center border-b py-2">
                    <span>{staff.name} ({staff.user_id})</span>
                    <div className="space-x-2">
                      <button 
                        className="text-blue-600 hover:underline"
                        onClick={() => alert('Implement kitchen user edit')}
                      >
                        Edit
                      </button>
                      <button
                        className={`px-2 py-1 rounded text-white ${
                          staff.is_active ? 'bg-red-600' : 'bg-green-600'
                        }`}
                        onClick={() => toggleActiveStatus(staff.id, staff.is_active)}
                      >
                        {staff.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              onClick={() => alert('Open create kitchen staff form')}
            >
              Create Kitchen Staff
            </button>
          </section>

        </div>
      )}
    </div>
  );
}
