
'use client'

import {
  useEffect,
  useState,
} from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OwnerWebsiteDesign from '../OwnerWebsiteDesign'

export default function OwnerWebsiteDesignPage() {
  const router = useRouter()

  const [stores, setStores] =
    useState([])

  const [storeId, setStoreId] =
    useState('')

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  useEffect(() => {
    let active = true

    async function loadStores() {
      try {
        const {
          data,
          error: authError,
        } = await supabase.auth.getSession()

        if (
          authError ||
          !data?.session?.access_token
        ) {
          router.replace(
            '/ecommerce/owner/login'
          )
          return
        }

        const response = await fetch(
          '/api/ecommerce/owner/overview',
          {
            cache: 'no-store',

            headers: {
              Authorization:
                `Bearer ${data.session.access_token}`,
            },
          }
        )

        const body =
          await response.json().catch(() => ({}))

        if (
          !response.ok ||
          !body.success
        ) {
          throw new Error(
            body.message ||
            'Unable to load your websites.'
          )
        }

        const uniqueStores =
          Array.from(
            new Map(
              (body.stores || [])
                .filter(item => item?.id)
                .map(item => [
                  item.id,
                  item,
                ])
            ).values()
          )

        if (!active) return

        setStores(uniqueStores)

        const selectedId =
          uniqueStores.find(
            item =>
              item.id === body.selected?.id
          )?.id ||
          uniqueStores[0]?.id ||
          ''

        setStoreId(selectedId)
      } catch (err) {
        if (active) {
          setError(err.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadStores()

    return () => {
      active = false
    }
  }, [router])

  const selectedStore =
    stores.find(
      item => item.id === storeId
    )

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-rose-400">
              Digital Dine-In · E-Commerce
            </p>

            <h1 className="mt-2 text-3xl font-black">
              Website Design
            </h1>
          </div>

          <Link
            href="/ecommerce/owner"
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm"
          >
            Back to Dashboard
          </Link>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-700 p-3 text-red-300"
          >
            {error}
          </p>
        )}

        {loading && (
          <p className="text-neutral-400">
            Loading your websites...
          </p>
        )}

        {!loading &&
          !stores.length && (
            <p className="text-neutral-400">
              No E-Commerce website assigned
              to this account.
            </p>
          )}

        {stores.length > 0 && (
          <>
            <label className="block max-w-md space-y-2">
              <span className="block text-sm font-semibold">
                Select Website
              </span>

              <select
                value={storeId}
                onChange={event =>
                  setStoreId(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3"
              >
                {stores.map(item => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <OwnerWebsiteDesign
              key={storeId}
              storeId={storeId}
              storeName={
                selectedStore?.name
              }
              storeSlug={
                selectedStore?.slug
              }
            />
          </>
        )}
      </div>
    </main>
  )
}