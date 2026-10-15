import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from './AuthContext';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }
    if (isSignup && !name.trim()) {
      Alert.alert('Missing info', 'Please enter your name.');
      return;
    }
    if (isSignup && password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    const error = isSignup
      ? await signUp(name, email, password)
      : await signIn(email, password);
    setBusy(false);
    if (error) {
      Alert.alert(isSignup ? 'Signup failed' : 'Login failed', error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoText}>💬</Text>
        </View>
        <Text style={styles.title}>{isSignup ? 'Create account' : 'Welcome back'}</Text>
        <Text style={styles.subtitle}>
          {isSignup ? 'Sign up to start chatting' : 'Log in to continue chatting'}
        </Text>

        {isSignup && (
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#8aa3b5"
            value={name}
            onChangeText={setName}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#8aa3b5"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#8aa3b5"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, busy && { opacity: 0.7 }]}
          onPress={submit}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>{isSignup ? 'Sign Up' : 'Login'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignup(!isSignup)}>
          <Text style={styles.switchText}>
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={styles.switchLink}>{isSignup ? 'Login' : 'Sign Up'}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  container: { flexGrow: 1, padding: 26, justifyContent: 'center' },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#29b6f6',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#1aa7ec',
    elevation: 8,
  },
  logoText: { fontSize: 38 },
  title: { color: '#12202e', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitle: {
    color: '#8aa3b5',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
  },
  input: {
    backgroundColor: '#eef8ff',
    color: '#12202e',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 14,
    fontSize: 15,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef8ff',
    borderRadius: 26,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  passwordInput: { flex: 1, color: '#12202e', fontSize: 15, paddingVertical: 14 },
  showText: { color: '#1aa7ec', fontWeight: '700', fontSize: 14 },
  button: {
    backgroundColor: '#29b6f6',
    borderRadius: 26,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    elevation: 4,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  switchText: { color: '#8aa3b5', textAlign: 'center', marginTop: 22, fontSize: 14 },
  switchLink: { color: '#1aa7ec', fontWeight: '700' },
});