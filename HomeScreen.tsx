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
  Modal,
} from 'react-native';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import Avatar from './Avatar';

type Contact = {
  id: string;
  name: string;
  avatarPath: string | null;
  lastMessage: string;
  lastTime: string | null;
};

const formatTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

// Short text shown in the chat list for each kind of message
const previewFor = (m: {
  kind?: string;
  text?: string | null;
  file_name?: string | null;
  deleted_at?: string | null;
}) => {
  if (m.deleted_at) return '🚫 This message was deleted';
  switch (m.kind) {
    case 'image':
      return '📷 Photo';
    case 'audio':
      return '🎤 Voice message';
    case 'video':
      return '🎥 Video';
    case 'file':
      return `📄 ${m.file_name || 'Document'}`;
    default:
      return m.text || '';
  }
};

// Supabase servers can differ by a second or two right after a token refresh.
// This is a harmless, temporary error, so we retry quietly instead of alerting.
const isClockSkewError = (message?: string) =>
  !!message && message.toLowerCase().includes('issued at future');

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [myName, setMyName] = useState('');
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [actionContact, setActionContact] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const me = user.id;

    // This app is open, so messages sent to me count as "delivered"
    supabase.rpc('mark_delivered').then(() => undefined);

    const fetchProfiles = () =>
      supabase.from('profiles').select('id, name, avatar_path').neq('id', me);

    let profilesRes = await fetchProfiles();
    if (profilesRes.error && isClockSkewError(profilesRes.error.message)) {
      await sleep(2000);
      profilesRes = await fetchProfiles();
    }

    if (profilesRes.error) {
      Alert.alert('Error', profilesRes.error.message);
      setLoading(false);
      return;
    }
    const profiles = profilesRes.data;

    const { data: mine } = await supabase
      .from('profiles')
      .select('name, avatar_path')
      .eq('id', me)
      .single();
    if (mine) {
      setMyName(mine.name || '');
      setMyAvatar(mine.avatar_path || null);
    }

    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('sender_id, receiver_id, text, created_at, kind, file_name, deleted_at')
      .order('created_at', { ascending: false })
      .limit(300);

    const lastByUser: Record<string, { preview: string; created_at: string; mine: boolean }> = {};
    (msgs || []).forEach((m: any) => {
      const isMine = m.sender_id === me;
      const other = isMine ? m.receiver_id : m.sender_id;
      if (!lastByUser[other]) {
        lastByUser[other] = { preview: previewFor(m), created_at: m.created_at, mine: isMine };
      }
    });

    // Home shows only people you have an active conversation with.
    // Everyone else is still in the Friends screen.
    const list: Contact[] = (profiles || [])
      .filter((p: any) => !!lastByUser[p.id])
      .map((p: any) => {
        const last = lastByUser[p.id];
        return {
          id: p.id,
          name: p.name,
          avatarPath: p.avatar_path || null,
          lastMessage: (last.mine ? 'You: ' : '') + last.preview,
          lastTime: last.created_at,
        };
      });

    list.sort((a, b) => (b.lastTime || '').localeCompare(a.lastTime || ''));

    setContacts(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const unsubscribeFocus = navigation.addListener('focus', () => load());

    const channel = supabase
      .channel('home-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        () => load(),
      )
      .subscribe();

    return () => {
      unsubscribeFocus();
      supabase.removeChannel(channel);
    };
  }, [load, navigation]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, search]);

  const confirmDeleteChat = (c: Contact) => {
    setActionContact(null);
    // let the sheet close before the confirm dialog opens
    setTimeout(() => {
      Alert.alert(
        `Delete chat with ${c.name}?`,
        'All messages will be removed from your side only. They stay in your Friends list.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase.rpc('delete_chat_for_me', { p_other: c.id });
              if (error) {
                Alert.alert('Error', error.message);
                return;
              }
              load();
            },
          },
        ],
      );
    }, 250);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Profile')}>
          <Avatar name={myName || '?'} path={myAvatar} size={42} />
        </TouchableOpacity>
      </View>

      <View style={styles.search}>
        <View style={styles.searchIcon}>
          <Text style={styles.searchIconText}>🔍</Text>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats"
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
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search
                ? 'No chats match your search.'
                : 'No conversations yet.\nTap the ✎ button to pick a friend and start chatting.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.contact}
              onLongPress={() => setActionContact(item)}
              onPress={() =>
                navigation.navigate('Chat', {
                  userId: item.id,
                  name: item.name,
                  avatarPath: item.avatarPath,
                })
              }>
              <View style={styles.avatarWrap}>
                <Avatar name={item.name} path={item.avatarPath} size={50} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.time}>{formatTime(item.lastTime)}</Text>
                </View>
                <Text style={styles.message} numberOfLines={1}>
                  {item.lastMessage}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Friends')}>
        <Text style={styles.fabText}>✎</Text>
      </TouchableOpacity>

      {/* Chat actions (long press) */}
      <Modal
        visible={!!actionContact}
        transparent
        animationType="fade"
        onRequestClose={() => setActionContact(null)}>
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setActionContact(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {actionContact?.name}
            </Text>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => actionContact && confirmDeleteChat(actionContact)}>
              <Text style={styles.sheetIcon}>🗑️</Text>
              <Text style={[styles.sheetText, styles.dangerText]}>Delete chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setActionContact(null)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 18, paddingTop: 16, marginTop: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { color: '#12202e', fontSize: 30, fontWeight: 'bold' },
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
  empty: {
    color: '#8aa3b5',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 20,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eef3f7',
  },
  avatarWrap: { marginRight: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#12202e', fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 8 },
  time: { color: '#9ab0c0', fontSize: 12 },
  message: { color: '#8aa3b5', fontSize: 13.5, marginTop: 4 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#29b6f6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  fabText: { color: 'white', fontSize: 26 },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  sheetTitle: { color: '#12202e', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sheetIcon: { fontSize: 22, width: 40 },
  sheetText: { color: '#12202e', fontSize: 16 },
  dangerText: { color: '#e5484d' },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 26,
    backgroundColor: '#eef8ff',
    alignItems: 'center',
  },
  sheetCancelText: { color: '#1aa7ec', fontSize: 15, fontWeight: '700' },
});