// Single source of truth for the "current trip" pointer that survives
// across screens. The home hero, the trip picker, and the manual-entry
// route all reach for the same key — keep it here so save-paths (QC,
// manual entry) can update it after a successful save and the home
// re-focuses onto the trip the user just wrote to instead of whatever
// stale id was last persisted.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const CURRENT_TRIP_STORAGE_KEY = 'evenly:current_trip_v1';

export async function getCurrentTripId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CURRENT_TRIP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setCurrentTripId(tripId: string | null): Promise<void> {
  try {
    if (tripId) {
      await AsyncStorage.setItem(CURRENT_TRIP_STORAGE_KEY, tripId);
    } else {
      await AsyncStorage.removeItem(CURRENT_TRIP_STORAGE_KEY);
    }
  } catch {
    // Best-effort: a write failure here only causes the home to fall back
    // to trips[0] on next focus, which is the same default the empty path
    // produces. Not worth surfacing.
  }
}
