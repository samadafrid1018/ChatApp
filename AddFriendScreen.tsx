import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Share,
  ScrollView,
} from 'react-native';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';

export default function AddFriendScreen({ navigation }: any) {
  const { user } = useAuth();
  const [myCode, setMyCode] = useState<string>('------');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('code')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.code) setMyCode(data.code);
      });
  }, [user]);

  const shareMyCode = async () => {
    try {
      await Share.share({
        message: `Add me on ChatApp! My friend code is ${myCode}`,
      });
    } catch (e) {
      // user closed the share sheet
    }
  };

  const addFriend = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      Alert.alert('Invalid code', 'Please enter the 6-digit code.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('add_contact_by_code', { p_code: trimmed });

    if (error) {
      setBusy(false);
      Alert.alert('Could not add friend', error.message);
      return;
    }
    if (!data || data.length === 0) {
      setBusy(false);
      Alert.alert('Not found', 'No user found with that code. Please check and try again.');
      return;
    }
    const friend = data[0];

    // The new friend's profile photo (visible now that you are contacts)
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', friend.id)
      .single();
    setBusy(false);

    navigation.replace('Chat', {
      userId: friend.id,
      name: friend.name,
      avatarPath: profile?.avatar_path || null,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Add a friend</Text>
      <Text style={styles.subtitle}>
        Share your code with a friend, or enter their code to start chatting.
      </Text>

      <View style={styles.codeCard}>
        <Text style={styles.cardLabel}>My code</Text>
        <Text style={styles.myCode}>{myCode}</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={shareMyCode}>
          <Text style={styles.shareText}>Share my code</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>Enter a friend's code</Text>
      <TextInput
        style={styles.input}
        placeholder="000000"
        placeholderTextColor="#b7c8d6"
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
      />

      <TouchableOpacity
        style={[styles.button, (busy || code.length !== 6) && { opacity: 0.6 }]}
        onPress={addFriend}
        disabled={busy || code.length !== 6}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Add friend</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#ffffff', padding: 22, marginTop: 40 },
  backBtn: { paddingVertical: 4, alignSelf: 'flex-start' },
  back: { color: '#12202e', fontSize: 26 },
  title: { color: '#12202e', fontSize: 28, fontWeight: 'bold', marginTop: 10 },
  subtitle: { color: '#8aa3b5', fontSize: 14, marginTop: 6, marginBottom: 22 },
  codeCard: {
    backgroundColor: '#e6f6ff',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    marginBottom: 28,
  },
  cardLabel: { color: '#5b7a90', fontSize: 13 },
  myCode: {
    color: '#0b86c4',
    fontSize: 40,
    fontWeight: 'bold',
    letterSpacing: 8,
    marginVertical: 10,
  },
  shareBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  shareText: { color: '#1aa7ec', fontWeight: '700', fontSize: 14 },
  section: { color: '#12202e', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  input: {
    backgroundColor: '#eef8ff',
    color: '#12202e',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#29b6f6',
    borderRadius: 26,
    paddingVertical: 15,
    alignItems: 'center',
    elevation: 4,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});