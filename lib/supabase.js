import { createClient } from '@supabase/supabase-js'

// Temporarily hardcoding for testing
const supabaseUrl = 'https://wispidcdmunqzahjacws.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3BpZGNkbXVucXphaGphY3dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDMxMjUsImV4cCI6MjEwNDAxOTEyNX0.QIGnw0nY4lcj6Jzb5K0TtlT7QcE4a2HuIg0QMuxID40'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

