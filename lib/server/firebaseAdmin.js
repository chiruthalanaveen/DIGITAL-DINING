import {
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

function readFirebaseCredentials() {
  const projectId = String(
    process.env.FIREBASE_PROJECT_ID || ''
  ).trim()

  const clientEmail = String(
    process.env.FIREBASE_CLIENT_EMAIL || ''
  ).trim()

  const privateKey = String(
    process.env.FIREBASE_PRIVATE_KEY || ''
  )
    .replace(/\\n/g, '\n')
    .trim()

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin configuration is incomplete. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.'
    )
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  }
}

export function getFirebaseMessaging() {
  if (!getApps().length) {
    const credentials =
      readFirebaseCredentials()

    initializeApp({
      credential: cert(credentials),
      projectId: credentials.projectId,
    })
  }

  return getMessaging()
}
