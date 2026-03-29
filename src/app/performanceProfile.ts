export type PerformanceProfile = {
    label: PerformanceProfileLabel;
    simulationResolution: number;
    maxDevicePixelRatio: number;
    pressureIterations: number;
};

export type PerformanceProfileLabel = 'potato' | 'low' | 'medium' | 'high';
export type PerformanceProfilePreference = 'auto' | PerformanceProfileLabel;

const PERFORMANCE_PROFILE_STORAGE_KEY = 'thrj-fluid-sim.performance-profile';

const POTATO_PROFILE: PerformanceProfile = {
    label: 'potato',
    simulationResolution: 192,
    maxDevicePixelRatio: 1.0,
    pressureIterations: 16
};

const LOW_PROFILE: PerformanceProfile = {
    label: 'low',
    simulationResolution: 256,
    maxDevicePixelRatio: 1.0,
    pressureIterations: 24
};

const MEDIUM_PROFILE: PerformanceProfile = {
    label: 'medium',
    simulationResolution: 384,
    maxDevicePixelRatio: 1.25,
    pressureIterations: 36
};

const HIGH_PROFILE: PerformanceProfile = {
    label: 'high',
    simulationResolution: 512,
    maxDevicePixelRatio: 1.5,
    pressureIterations: 48
};

type NavigatorWithDeviceMemory = Navigator & {
    deviceMemory?: number;
};

export function detectPerformanceProfile(): PerformanceProfile {
    const hardwareConcurrency = navigator.hardwareConcurrency ?? 8;
    const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory ?? 8;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const smallerViewportSide = Math.min(window.innerWidth, window.innerHeight);

    if (
        isCoarsePointer ||
        hardwareConcurrency <= 4 ||
        deviceMemory <= 4 ||
        smallerViewportSide <= 900
    ) {
        return LOW_PROFILE;
    }

    if (
        hardwareConcurrency <= 8 ||
        deviceMemory <= 8 ||
        smallerViewportSide <= 1200
    ) {
        return MEDIUM_PROFILE;
    }

    return HIGH_PROFILE;
}

export function resolvePerformanceProfile(
    preference: PerformanceProfilePreference
): PerformanceProfile {
    if (preference === 'potato') {
        return POTATO_PROFILE;
    }

    if (preference === 'low') {
        return LOW_PROFILE;
    }

    if (preference === 'medium') {
        return MEDIUM_PROFILE;
    }

    if (preference === 'high') {
        return HIGH_PROFILE;
    }

    return detectPerformanceProfile();
}

export function loadPerformanceProfilePreference(): PerformanceProfilePreference {
    try {
        const value = window.localStorage.getItem(PERFORMANCE_PROFILE_STORAGE_KEY);

        if (
            value === 'potato' ||
            value === 'low' ||
            value === 'medium' ||
            value === 'high' ||
            value === 'auto'
        ) {
            return value;
        }
    } catch {
        // Ignore storage access failures and fall back to auto.
    }

    return 'auto';
}

export function savePerformanceProfilePreference(
    preference: PerformanceProfilePreference
): void {
    try {
        window.localStorage.setItem(PERFORMANCE_PROFILE_STORAGE_KEY, preference);
    } catch {
        // Ignore storage access failures.
    }
}
