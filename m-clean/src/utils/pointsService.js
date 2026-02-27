// src/utils/pointsService.js
// ---------------------------------------------------------------
// Safely awards +10 points to a citizen when their complaint is
// marked as "cleared" by an admin.
//
// Uses a Firestore transaction to guarantee:
//   • No double-awarding (checks points_awarded flag)
//   • Atomic increment of points + cleared_complaints counter
// ---------------------------------------------------------------

import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import { db } from '../firebase'

const POINTS_PER_CLEAR = 10

/**
 * Awards points to the citizen who filed the report when an admin
 * clears it. Safe to call multiple times — idempotent.
 *
 * @param {string} reportId   - Firestore document ID of the report
 * @param {string} citizenUid - UID of the citizen who filed the report
 * @returns {Promise<{ awarded: boolean, points: number }>}
 */
export async function awardPointsForClear(reportId, citizenUid) {
  if (!reportId || !citizenUid) {
    return { awarded: false, points: 0 }
  }

  const reportRef = doc(db, 'reports', reportId)
  const userRef   = doc(db, 'users',   citizenUid)

  try {
    const awarded = await runTransaction(db, async (tx) => {
      const [reportSnap, userSnap] = await Promise.all([
        tx.get(reportRef),
        tx.get(userRef),
      ])

      // Guard: report must exist and points must not have been awarded yet
      if (!reportSnap.exists()) return false
      if (reportSnap.data().points_awarded === true) return false

      // Mark report as points awarded
      tx.update(reportRef, {
        points_awarded: true,
        updated_at:     serverTimestamp(),
      })

      // Upsert user document — works even if points field didn't exist before
      if (userSnap.exists()) {
        tx.update(userRef, {
          points:              increment(POINTS_PER_CLEAR),
          cleared_complaints:  increment(1),
        })
      } else {
        // Create minimal user record if somehow it's missing
        tx.set(userRef, {
          uid:                citizenUid,
          points:             POINTS_PER_CLEAR,
          cleared_complaints: 1,
          role:               'citizen',
          created_at:         serverTimestamp(),
        })
      }

      return true
    })

    return { awarded, points: awarded ? POINTS_PER_CLEAR : 0 }
  } catch (err) {
    console.error('[pointsService] awardPointsForClear failed:', err)
    return { awarded: false, points: 0 }
  }
}
