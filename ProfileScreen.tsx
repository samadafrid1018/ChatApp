import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import Avatar from './Avatar';

const BUCKET = 'avatars';

const isClockSkewError = (message?: string) =>
  !!message && message.toLowerCase().includes('issued at future');

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function ProfileScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const fetchProfile = () =>
      supabase.from('profiles').select('name, avatar_path').eq('id', user.id).single();

    let res = await fetchProfile();
    if (res.error && isClockSkewError(res.error.message)) {
      await sleep(2000);
      res = await fetchProfile();
    }
    if (res.error) {
      Alert.alert('Error', res.error.message);
      setLoading(false);
      return;
    }
    setName(res.data.name || '');
    setSavedName(res.data.name || '');
    setAvatarPath(res.data.avatar_path || null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const saveName = async () => {
    if (!user) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      Alert.alert('Invalid name', 'Name must be between 1 and 40 characters.');
      return;
    }
    if (trimmed === savedName) return;
    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ name: trimmed }).eq('id', user.id);
    setSavingName(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setName(trimmed);
    setSavedName(trimmed);
    Alert.alert('Saved', 'Your name was updated.');
  };

  const changePhoto = async () => {
    if (!user || uploading) return;
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
      maxWidth: 600,
      maxHeight: 600,
    });
    if (res.didCancel) return;
    if (res.errorMessage) {
      Alert.alert('Error', res.errorMessage);
      return;
    }
    const asset = res.assets?.[0];
    if (!asset?.uri) return;

    const mime = asset.type || 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const newPath = `${user.id}/${Date.now()}.${ext}`;

    setUploading(true);
    try {
      const response = await fetch(asset.uri);
      const body = await response.arrayBuffer();

      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, body, { contentType: mime, upsert: false });
      if (upError) throw upError;

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_path: newPath })
        .eq('id', user.id);
      if (error) {
        await supabase.storage.from(BUCKET).remove([newPath]);
        throw error;
      }

      const old = avatarPath;
      setAvatarPath(newPath);
      if (old) supabase.storage.from(BUCKET).remove([old]);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Something went wrong.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    if (!user || !avatarPath || uploading) return;
    Alert.alert('Remove photo', 'Do you want to remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setUploading(true);
          const old = avatarPath;
          const { error } = await supabase
            .from('profiles')
            .update({ avatar_path: null })
            .eq('id', user.id);
          setUploading(false);
          if (error) {
            Alert.alert('Could not remove', error.message);
            return;
          }
          setAvatarPath(null);
          if (old) supabase.storage.from(BUCKET).remove([old]);
        },
      },
    ]);
  };

  const confirmLogout = () => {
    Alert.alert('Log out', 'Do you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#29b6f6" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarWrap}>
            <TouchableOpacity activeOpacity={0.85} onPress={changePhoto} disabled={uploading}>
              <Avatar name={savedName || name} path={avatarPath} size={116} />
              <View style={styles.cameraBadge}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.cameraText}>📷</Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={changePhoto} disabled={uploading}>
              <Text style={styles.link}>{avatarPath ? 'Change photo' : 'Add photo'}</Text>
            </TouchableOpacity>
            {avatarPath ? (
              <TouchableOpacity onPress={removePhoto} disabled={uploading}>
                <Text style={styles.linkDanger}>Remove photo</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#8aa3b5"
            maxLength={40}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, (savingName || name.trim() === savedName) && styles.btnDisabled]}
            onPress={saveName}
            disabled={savingName || name.trim() === savedName}>
            {savingName ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryText}>Save name</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.label, { marginTop: 26 }]}>Email</Text>
          <View style={styles.emailBox}>
            <Text style={styles.emailText} numberOfLines={1}>
              {user?.email || '—'}
            </Text>
          </View>
          <Text style={styles.hint}>This is the email you log in with.</Text>

          <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', marginTop: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { paddingRight: 12, paddingVertical: 4 },
  back: { color: '#12202e', fontSize: 24 },
  title: { color: '#12202e', fontSize: 24, fontWeight: 'bold' },
  content: { paddingHorizontal: 22, paddingBottom: 40 },
  avatarWrap: { alignItems: 'center', marginTop: 10, marginBottom: 26 },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#29b6f6',
    borderWidth: 3,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraText: { fontSize: 15 },
  link: { color: '#1aa7ec', fontSize: 15, fontWeight: '700', marginTop: 12 },
  linkDanger: { color: '#e5484d', fontSize: 14, fontWeight: '600', marginTop: 10 },
  label: { color: '#5b7a90', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#eef8ff',
    color: '#12202e',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#29b6f6',
    borderRadius: 26,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
  },
  btnDisabled: { opacity: 0.5 },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  emailBox: {
    backgroundColor: '#f4f8fb',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  emailText: { color: '#5b7a90', fontSize: 16 },
  hint: { color: '#8aa3b5', fontSize: 12.5, marginTop: 8, marginLeft: 6 },
  logoutBtn: {
    marginTop: 34,
    borderRadius: 26,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#fdeeee',
  },
  logoutText: { color: '#e5484d', fontSize: 16, fontWeight: '700' },
});