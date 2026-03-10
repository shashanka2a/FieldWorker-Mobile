import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDateKey } from '@/lib/dailyReportStorage';

interface AppContextType {
    selectedDate: Date;
    setSelectedDate: (date: Date) => void;
    selectedProject: { name: string };
    setSelectedProject: (project: { name: string }) => void;
    projects: { name: string }[];
    currentUser: { name: string; role: string };
}

const AppContext = createContext<AppContextType | null>(null);

const PROJECTS = [
    { name: 'North Valley Solar Farm' },
    { name: 'East Ridge Pipeline' },
    { name: 'Mountain View Substation' },
];

const CURRENT_USER = {
    name: 'Ricky Smith',
    role: 'Field Supervisor',
};

export function AppProvider({ children }: { children: ReactNode }) {
    const [selectedDate, setSelectedDateState] = useState<Date>(new Date());
    const [selectedProject, setSelectedProjectState] = useState(PROJECTS[0]);

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
    }, []);

    const setSelectedDate = async (date: Date) => {
        setSelectedDateState(date);
        await AsyncStorage.setItem('selectedDate', date.toISOString());
    };

    const setSelectedProject = (project: { name: string }) => {
        setSelectedProjectState(project);
    };

    return (
        <AppContext.Provider
            value={{
                selectedDate,
                setSelectedDate,
                selectedProject,
                setSelectedProject,
                projects: PROJECTS,
                currentUser: CURRENT_USER,
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
