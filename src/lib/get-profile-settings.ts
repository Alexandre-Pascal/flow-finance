/**
 * @file get-profile-settings.ts
 * @description Lecture mémoïsée des préférences profil pour le layout / pages.
 */

import { cache } from "react";
import { getAppUser } from "@/lib/auth";
import {
  DEFAULT_PROFILE_SETTINGS,
  normalizeProfileSettings,
  type ProfileSettings,
} from "@/lib/profile-settings";
import { createClient } from "@/lib/supabase/server";

export const getProfileSettings = cache(
  async function getProfileSettings(): Promise<ProfileSettings> {
    const user = await getAppUser();
    if (!user || user.isDemo) {
      return DEFAULT_PROFILE_SETTINGS;
    }

    const supabase = await createClient();
    if (!supabase) {
      return DEFAULT_PROFILE_SETTINGS;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("settings")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_PROFILE_SETTINGS;
    }

    return normalizeProfileSettings(data.settings);
  },
);
