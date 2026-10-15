import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import Avatar from './Avatar';

type Friend = {
  id: string;
  name: string;
  avatarPath: string | null;
};

const isClockSkewError = (message?: string) =>
  !!message && message.toLowerCase().includes('issued at future');

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function FriendsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const me = user.id;

    const fetchFriends = () =>
      supabase.from('profiles').select('id, name, avatar_path').neq('id', me);

    let res = await fetchFriends();
    if (res.error && isClockSkewError(res.error.message)) {
      await sleep(2000);
      res = await fetchFriends();
    }
    if (res.error) {
      Alert.alert('Error', res.error.message);
      setLoading(false);
      return;
    }

    const list: Friend[] = (res.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      avatarPath: p.avatar_path || null,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    setFriends(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const unsubscribe = navigation.addListener('focus', () => load());
    return unsubscribe;
  }, [load, navigation]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }, [friends, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Friends</Text>
          {!loading && (
            <Text style={styles.subtitle}>
              {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.search}>
        <View style={styles.searchIcon}>
          <Text style={styles.searchIconText}>🔍</Text>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends"
          placeholderTextColor="#8aa3b5"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <ActivityIndicator color="#29b6f6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            search ? null : (
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.row}
                onPress={() => navigation.navigate('AddFriend')}>
                <View style={styles.addCircle}>
                  <Text style={styles.addCircleText}>✎</Text>
                </View>
                <Text style={styles.addText}>Add new friend</Text>
              </TouchableOpacity>
            )
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search
                ? 'No friends match your search.'
                : 'No friends yet. Tap "Add new friend" and enter their code.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.row}
              onPress={() =>
                navigation.navigate('Chat', {
                  userId: item.id,
                  name: item.name,
                  avatarPath: item.avatarPath,
                })
              }>
              <View style={styles.avatarWrap}>
                <Avatar name={item.name} path={item.avatarPath} size={48} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.hint}>Tap to chat</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 18, marginTop: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  backBtn: { paddingRight: 14, paddingVertical: 4 },
  back: { color: '#12202e', fontSize: 24 },
  title: { color: '#12202e', fontSize: 26, fontWeight: 'bold' },
  subtitle: { color: '#8aa3b5', fontSize: 13, marginTop: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef8ff',
    borderRadius: 26,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  searchIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#29b6f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchIconText: { fontSize: 14 },
  searchInput: { flex: 1, color: '#12202e', fontSize: 15, marginLeft: 10, paddingVertical: 8 },
  empty: { color: '#8aa3b5', textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eef3f7',
  },
  avatarWrap: { marginRight: 12 },
  name: { color: '#12202e', fontSize: 16, fontWeight: 'bold' },
  hint: { color: '#9ab0c0', fontSize: 12.5, marginTop: 3 },
  addCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#29b6f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addCircleText: { color: '#ffffff', fontSize: 20 },
  addText: { color: '#1aa7ec', fontSize: 16, fontWeight: '700' },
});