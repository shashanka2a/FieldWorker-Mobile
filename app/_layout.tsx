import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/context/AppContext';

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <AppProvider>
                    <StatusBar style="light" backgroundColor="#1C1C1E" />
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: '#1C1C1E' },
                            animation: 'slide_from_right',
                        }}
                    >
                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        <Stack.Screen name="notes/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="notes/add" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="chemicals/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="metrics/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="survey/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="checklist/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="attachments/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="attachments/add" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="safety/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="safety/template" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="safety/read" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="safety/schedule" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="safety/signatures/index" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="safety/signatures/digital" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="safety/signatures/photo" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="observations/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="observations/add" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="incidents/index" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="incidents/add" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="report/preview" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="report/sign" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
                        <Stack.Screen name="gallery/index" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="reports/index" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="projects/index" options={{ headerShown: false, animation: 'slide_from_right' }} />
                        <Stack.Screen name="settings/index" options={{ headerShown: false, animation: 'slide_from_right' }} />
                    </Stack>
                </AppProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
