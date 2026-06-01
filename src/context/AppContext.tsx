import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    ReactNode,
    useMemo,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDateKey, parseDateKeyLocal } from '@/lib/dailyReportStorage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface Project {
    id: string;
    name: string;
    address?: string;
    zipcode?: string;
}

type ProjectRow = {
    id: string;
    name: string;
    address?: string | null;
    street_address?: string | null;
    zipcode?: string | null;
};

function normalizeProject(row: ProjectRow): Project {
    const street = (row.street_address ?? row.address ?? '').trim();
    const zip = (row.zipcode ?? '').trim();
    return {
        id: row.id,
        name: row.name,
        ...(street ? { address: street } : {}),
        ...(zip ? { zipcode: zip } : {}),
    };
}

async function loadProjectsFromSupabase(): Promise<Project[]> {
    const order = { ascending: true as const };
    let res = await supabase
        .from('projects')
        .select('id, name, street_address, zipcode')
        .order('name', order);

    if (res.error) {
        res = await supabase
            .from('projects')
            .select('id, name, address, zipcode')
            .order('name', order);
    }

    if (res.error) throw res.error;
    return (res.data ?? []).map((row) => normalizeProject(row as ProjectRow));
}

interface AppContextType {
    selectedDate: Date;
    setSelectedDate: (date: Date) => void;
    selectedProject: Project;
    setSelectedProject: (project: Project) => void;
    projects: Project[];
    loadingProjects: boolean;
    currentUser: { name: string; role: string };
    refreshProjects: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const FALLBACK_PROJECT: Project = { id: '', name: 'No Project Selected' };

export function AppProvider({ children }: { children: ReactNode }) {
    const { session, authLoading } = useAuth();
    const [selectedDate, setSelectedDateState] = useState<Date>(new Date());
    const [selectedProject, setSelectedProjectState] = useState<Project>(FALLBACK_PROJECT);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(true);

    const currentUser = useMemo(() => {
        const u = session?.user;
        if (!u) {
            return { name: 'Field Worker', role: 'Field Supervisor' };
        }
        const meta = u.user_metadata as Record<string, unknown> | undefined;
        const name =
            typeof meta?.full_name === 'string'
                ? meta.full_name
                : (u.email?.split('@')[0] ?? 'Field Worker');
        const role =
            typeof meta?.role === 'string'
                ? meta.role
                : 'Field Supervisor';
        return { name, role };
    }, [session]);

    const fetchProjects = async () => {
        setLoadingProjects(true);
        try {
            const data = await loadProjectsFromSupabase();
            if (data.length > 0) {
                setProjects(data);

                // Try to restore the previously selected project
                const savedProjectId = await AsyncStorage.getItem('selectedProjectId');
                const match = savedProjectId
                    ? data.find((p) => p.id === savedProjectId)
                    : null;

                // If we have a match restore it, otherwise default to first project
                setSelectedProjectState(match ?? data[0]);
            } else {
                setProjects([]);
                setSelectedProjectState(FALLBACK_PROJECT);
            }
        } catch (err) {
            console.error('Failed to load projects from Supabase:', err);
            // Keep whatever was previously selected
        } finally {
            setLoadingProjects(false);
        }
    };

    useEffect(() => {
        AsyncStorage.getItem('selectedDate').then((saved) => {
            if (!saved) return;
            if (/^\d{4}-\d{2}-\d{2}$/.test(saved)) {
                setSelectedDateState(parseDateKeyLocal(saved));
                return;
            }
            const parsed = new Date(saved);
            if (!isNaN(parsed.getTime())) {
                setSelectedDateState(parsed);
                AsyncStorage.setItem('selectedDate', getDateKey(parsed)).catch(() => {});
            }
        });
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (session?.user) {
            fetchProjects();
            return;
        }
        setLoadingProjects(false);
        setProjects([]);
        setSelectedProjectState(FALLBACK_PROJECT);
    }, [session?.user?.id, authLoading]);

    const setSelectedDate = async (date: Date) => {
        setSelectedDateState(date);
        await AsyncStorage.setItem('selectedDate', getDateKey(date));
    };

    const setSelectedProject = async (project: Project) => {
        setSelectedProjectState(project);
        await AsyncStorage.setItem('selectedProjectId', project.id);
    };

    return (
        <AppContext.Provider
            value={{
                selectedDate,
                setSelectedDate,
                selectedProject,
                setSelectedProject,
                projects,
                loadingProjects,
                currentUser,
                refreshProjects: fetchProjects,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppContext must be used within AppProvider');
    return ctx;
}
