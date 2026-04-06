import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDateKey } from '@/lib/dailyReportStorage';
import { supabase } from '@/lib/supabase';

interface Project {
    id: string;
    name: string;
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

const CURRENT_USER = {
    name: 'Field Worker',
    role: 'Field Supervisor',
};

export function AppProvider({ children }: { children: ReactNode }) {
    const [selectedDate, setSelectedDateState] = useState<Date>(new Date());
    const [selectedProject, setSelectedProjectState] = useState<Project>(FALLBACK_PROJECT);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(true);

    const fetchProjects = async () => {
        setLoadingProjects(true);
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('id, name')
                .order('name', { ascending: true });

            if (error) throw error;
            if (data && data.length > 0) {
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
        // Load saved date from storage
        AsyncStorage.getItem('selectedDate').then((saved) => {
            if (saved) {
                const parsed = new Date(saved);
                if (!isNaN(parsed.getTime())) {
                    setSelectedDateState(parsed);
                }
            }
        });

        // Fetch projects from Supabase
        fetchProjects();
    }, []);

    const setSelectedDate = async (date: Date) => {
        setSelectedDateState(date);
        await AsyncStorage.setItem('selectedDate', date.toISOString());
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
                currentUser: CURRENT_USER,
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
