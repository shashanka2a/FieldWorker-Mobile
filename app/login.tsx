import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';

const COLORS = {
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    brand: '#FF6633',
    subtitle: '#98989D',
    white: '#FFFFFF',
    error: '#FF453A',
};

export default function LoginScreen() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSignIn = async () => {
        setError(null);
        if (!email.trim() || !password) {
            setError('Enter email and password.');
            return;
        }
        setSubmitting(true);
        try {
            await signIn(email, password);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Sign-in failed.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <KeyboardAwareScrollView
                style={styles.flex}
                contentContainerStyle={styles.inner}
                keyboardShouldPersistTaps="handled"
            >
                    <View style={styles.logoWrap}>
                        <View style={styles.logoBadge}>
                            <Ionicons name="construct-outline" size={44} color={COLORS.white} />
                        </View>
                        <Text style={styles.title}>UtilityVision</Text>
                        <Text style={styles.subtitle}>Sign in with your workspace account</Text>
                    </View>

                    <KeyboardField style={styles.card}>
                        <Text style={styles.label}>Email</Text>
                        <ScrollInputField>
                            <TextInput
                                style={styles.input}
                                placeholder="you@company.com"
                                placeholderTextColor={COLORS.subtitle}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                                textContentType="username"
                                autoComplete="email"
                                value={email}
                                onChangeText={setEmail}
                                editable={!submitting}
                            />
                        </ScrollInputField>

                        <Text style={[styles.label, styles.labelSpaced]}>Password</Text>
                        <View style={styles.passwordRow}>
                            <ScrollInputField style={{ flex: 1 }}>
                                <TextInput
                                    style={styles.passwordInput}
                                    placeholder="Password"
                                    placeholderTextColor={COLORS.subtitle}
                                    secureTextEntry={!showPassword}
                                    textContentType="password"
                                    autoComplete="password"
                                    value={password}
                                    onChangeText={setPassword}
                                    editable={!submitting}
                                    onSubmitEditing={handleSignIn}
                                />
                            </ScrollInputField>
                            <TouchableOpacity
                                style={styles.eyeBtn}
                                onPress={() => setShowPassword((v) => !v)}
                                hitSlop={12}
                                accessibilityRole="button"
                                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={22}
                                    color={COLORS.subtitle}
                                />
                            </TouchableOpacity>
                        </View>

                        {error ? <Text style={styles.error}>{error}</Text> : null}

                        <TouchableOpacity
                            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
                            onPress={handleSignIn}
                            disabled={submitting}
                            activeOpacity={0.85}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.primaryBtnText}>Sign in</Text>
                            )}
                        </TouchableOpacity>
                    </KeyboardField>
            </KeyboardAwareScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.surface },
    flex: { flex: 1 },
    inner: {
        flexGrow: 1,
        paddingHorizontal: 24,
        justifyContent: 'center',
    },
    logoWrap: { alignItems: 'center', marginBottom: 36 },
    logoBadge: {
        width: 88,
        height: 88,
        borderRadius: 22,
        backgroundColor: COLORS.brand,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    title: {
        color: COLORS.white,
        fontSize: 28,
        fontWeight: '700',
    },
    subtitle: {
        color: COLORS.subtitle,
        fontSize: 15,
        marginTop: 8,
        textAlign: 'center',
    },
    card: {
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    label: {
        color: COLORS.subtitle,
        fontSize: 13,
        fontWeight: '600',
    },
    labelSpaced: { marginTop: 16 },
    input: {
        marginTop: 8,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 14 : 10,
        color: COLORS.white,
        fontSize: 16,
    },
    passwordRow: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        paddingRight: 10,
    },
    passwordInput: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 14 : 10,
        color: COLORS.white,
        fontSize: 16,
    },
    eyeBtn: { paddingVertical: 8 },
    error: {
        color: COLORS.error,
        fontSize: 14,
        marginTop: 12,
    },
    primaryBtn: {
        marginTop: 22,
        backgroundColor: COLORS.brand,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
    },
    primaryBtnDisabled: { opacity: 0.65 },
    primaryBtnText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
});
