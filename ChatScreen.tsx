import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
  AppState,
  Alert,
  Image,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { pick, types } from '@react-native-documents/picker';
import Sound from 'react-native-nitro-sound';
import Video from 'react-native-video';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import Avatar from './Avatar';

type Msg = {
  id: string;
  kind: 'text' | 'image' | 'file' | 'audio' | 'video';
  text: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  durationMs: number | null;
  deleted: boolean;
  deliveredAt: string | null;
  readAt: string | null;
  mine: boolean;
  createdAt: string;
};

const BUCKET = 'chat-media';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MIN_VOICE_MS = 700;
const COLUMNS =
  'id, sender_id, receiver_id, text, created_at, kind, file_path, file_name, file_size, mime_type, duration_ms, deleted_at, delivered_at, read_at';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const safe = async (fn: () => any) => {
  try {
    await fn();
  } catch (e) {
    // ignore
  }
};

// Generic message so a blocked person is not told they were blocked
const sendErrorText = (e: any) =>
  e?.code === '42501' || /row-level security/i.test(e?.message || '')
    ? 'This message could not be sent.'
    : e?.message || 'Something went wrong.';

// Signed URLs are cached for the app session
const urlCache = new Map<string, string>();

const getSignedUrl = async (path: string): Promise<string | null> => {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
  if (error || !data) return null;
  urlCache.set(path, data.signedUrl);
  return data.signedUrl;
};

function MediaImage({
  path,
  onPress,
  onLongPress,
}: {
  path: string;
  onPress: (url: string) => void;
  onLongPress: () => void;
}) {
  const [url, setUrl] = useState<string | null>(urlCache.get(path) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!url) {
      getSignedUrl(path).then((u) => {
        if (!active) return;
        if (u) setUrl(u);
        else setFailed(true);
      });
    }
    return () => {
      active = false;
    };
  }, [path, url]);

  if (failed) {
    return (
      <View style={[styles.image, styles.imageCenter]}>
        <Text style={styles.imageError}>Image unavailable</Text>
      </View>
    );
  }
  if (!url) {
    return (
      <View style={[styles.image, styles.imageCenter]}>
        <ActivityIndicator color="#29b6f6" />
      </View>
    );
  }
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(url)} onLongPress={onLongPress}>
      <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
    </TouchableOpacity>
  );
}

export default function ChatScreen({ navigation, route }: any) {
  const { userId: otherId, name, avatarPath } = route.params;
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [chatMenuVisible, setChatMenuVisible] = useState(false);
  const [actionMsg, setActionMsg] = useState<Msg | null>(null);
  const [iBlocked, setIBlocked] = useState(false);

  // voice recording
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const recordMsRef = useRef(0);
  const recordingRef = useRef(false);

  // voice playback
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [playDur, setPlayDur] = useState(0);

  const listRef = useRef<FlatList<Msg>>(null);

  const toMsg = useCallback(
    (m: any): Msg => ({
      id: String(m.id),
      kind: m.kind || 'text',
      text: m.text ?? null,
      filePath: m.file_path ?? null,
      fileName: m.file_name ?? null,
      fileSize: m.file_size ?? null,
      durationMs: m.duration_ms ?? null,
      deleted: !!m.deleted_at,
      deliveredAt: m.delivered_at ?? null,
      readAt: m.read_at ?? null,
      mine: m.sender_id === user?.id,
      createdAt: m.created_at,
    }),
    [user],
  );

  const addMessage = useCallback((msg: Msg) => {
    setMessages((prev) => (prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  const markDeleted = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              deleted: true,
              text: null,
              filePath: null,
              fileName: null,
              fileSize: null,
              durationMs: null,
            }
          : m,
      ),
    );
  }, []);

  // Tell the sender we have seen their messages (only while the app is on screen)
  const markRead = useCallback(() => {
    if (AppState.currentState !== 'active') return;
    supabase.rpc('mark_read', { p_other: otherId }).then(() => undefined);
  }, [otherId]);

  useEffect(() => {
    if (!user) return;
    const me = user.id;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(COLUMNS)
        .or(
          `and(sender_id.eq.${me},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me})`,
        )
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      setMessages((data || []).map(toMsg));
      markRead();
    };

    loadMessages();

    const channel = supabase
      .channel(`chat-${me}-${otherId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `receiver_id=eq.${me}`,
        },
        (payload: any) => {
          if (payload.new.sender_id === otherId) {
            addMessage(toMsg(payload.new));
            markRead();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `receiver_id=eq.${me}`,
        },
        (payload: any) => {
          if (payload.new.sender_id === otherId && payload.new.deleted_at) {
            markDeleted(String(payload.new.id));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `sender_id=eq.${me}`,
        },
        (payload: any) => {
          // delivered / seen updates for messages I sent
          if (payload.new.receiver_id !== otherId) return;
          const id = String(payload.new.id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    deliveredAt: payload.new.delivered_at ?? m.deliveredAt,
                    readAt: payload.new.read_at ?? m.readAt,
                  }
                : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, otherId, toMsg, addMessage, markDeleted, markRead]);

  // When the app comes back to the foreground, mark what we missed as seen
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') markRead();
    });
    return () => sub.remove();
  }, [markRead]);

  // Did I block this person?
  useEffect(() => {
    if (!user) return;
    supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocked_id', otherId)
      .limit(1)
      .then(({ data }) => setIBlocked(!!data && data.length > 0));
  }, [user, otherId]);

  // Audio listeners + cleanup when leaving the screen
  useEffect(() => {
    Sound.addPlayBackListener((e: any) => {
      setPlayPos(e.currentPosition || 0);
      if (e.duration) setPlayDur(e.duration);
    });
    Sound.addPlaybackEndListener(() => {
      setPlayingId(null);
      setPaused(false);
      setPlayPos(0);
    });
    return () => {
      Sound.removePlayBackListener();
      Sound.removePlaybackEndListener();
      safe(() => Sound.stopPlayer());
      if (recordingRef.current) {
        safe(() => Sound.stopRecorder());
        Sound.removeRecordBackListener();
      }
    };
  }, []);

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending || uploading) return;
    setSending(true);
    setMessage('');
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ receiver_id: otherId, text, kind: 'text' })
      .select(COLUMNS)
      .single();
    setSending(false);
    if (error) {
      setMessage(text);
      Alert.alert('Message not sent', sendErrorText(error));
      return;
    }
    if (data) addMessage(toMsg(data));
  };

  // Upload a local file to storage, then create the chat message
  const uploadAndSend = async (file: {
    uri: string;
    name: string;
    mime: string;
    size: number | null;
    kind: 'image' | 'file' | 'audio' | 'video';
    durationMs?: number;
  }) => {
    if (!user) return;
    if (file.size && file.size > MAX_FILE_SIZE) {
      Alert.alert('File too large', 'Maximum file size is 50 MB.');
      return;
    }
    setUploading(true);
    let uploadedPath: string | null = null;
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
      const path = `${user.id}/${Date.now()}-${safeName}`;

      const response = await fetch(file.uri);
      const body = await response.arrayBuffer();

      if (body.byteLength > MAX_FILE_SIZE) {
        Alert.alert('File too large', 'Maximum file size is 50 MB.');
        return;
      }

      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(path, body, { contentType: file.mime, upsert: false });
      if (upError) throw upError;
      uploadedPath = path;

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          receiver_id: otherId,
          kind: file.kind,
          file_path: path,
          file_name: file.name,
          file_size: file.size ?? body.byteLength,
          mime_type: file.mime,
          duration_ms: file.durationMs ?? null,
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      uploadedPath = null;
      if (data) addMessage(toMsg(data));
    } catch (e: any) {
      // Do not leave an orphan file in storage if the message was not created
      if (uploadedPath) {
        const orphan = uploadedPath;
        safe(() => supabase.storage.from(BUCKET).remove([orphan]));
      }
      Alert.alert('Upload failed', sendErrorText(e));
    } finally {
      setUploading(false);
    }
  };

  const pickPhoto = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
      maxWidth: 1600,
      maxHeight: 1600,
    });
    if (res.didCancel) return;
    if (res.errorMessage) {
      Alert.alert('Error', res.errorMessage);
      return;
    }
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    await uploadAndSend({
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}.jpg`,
      mime: asset.type || 'image/jpeg',
      size: asset.fileSize ?? null,
      kind: 'image',
    });
  };

  const pickVideo = async () => {
    const res = await launchImageLibrary({
      mediaType: 'video',
      selectionLimit: 1,
      videoQuality: 'medium',
    });
    if (res.didCancel) return;
    if (res.errorMessage) {
      Alert.alert('Error', res.errorMessage);
      return;
    }
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    await uploadAndSend({
      uri: asset.uri,
      name: asset.fileName || `video-${Date.now()}.mp4`,
      mime: asset.type || 'video/mp4',
      size: asset.fileSize ?? null,
      kind: 'video',
      durationMs: asset.duration ? Math.round(asset.duration * 1000) : undefined,
    });
  };

  const pickDocument = async () => {
    try {
      const [doc] = await pick({ type: [types.allFiles] });
      if (!doc?.uri) return;
      await uploadAndSend({
        uri: doc.uri,
        name: doc.name || `file-${Date.now()}`,
        mime: doc.type || 'application/octet-stream',
        size: doc.size ?? null,
        kind: 'file',
      });
    } catch (e: any) {
      if (e?.code === 'OPERATION_CANCELED') return;
      Alert.alert('Error', e?.message || 'Could not pick the file.');
    }
  };

  const chooseAttach = (action: () => Promise<void>) => {
    setMenuVisible(false);
    // small delay so the sheet closes before the picker opens
    setTimeout(() => {
      action();
    }, 250);
  };

  const openAttachMenu = () => {
    if (uploading || recording) return;
    setMenuVisible(true);
  };

  const openFile = async (path: string) => {
    const url = await getSignedUrl(path);
    if (!url) {
      Alert.alert('Error', 'Could not open this file.');
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert('Error', 'No app found to open this file.'));
  };

  const openVideo = async (path: string) => {
    await stopPlayback();
    const url = await getSignedUrl(path);
    if (!url) {
      Alert.alert('Error', 'Could not load this video.');
      return;
    }
    setVideoUrl(url);
  };

  // ---------- Delete messages ----------
  const deleteForMe = async (m: Msg) => {
    setActionMsg(null);
    const { error } = await supabase.rpc('delete_message_for_me', { p_id: Number(m.id) });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    if (playingId === m.id) await stopPlayback();
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  };

  const deleteForEveryone = (m: Msg) => {
    setActionMsg(null);
    // let the sheet close before the confirm dialog opens
    setTimeout(() => {
      Alert.alert('Delete for everyone?', 'This message will be removed for both of you.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { data, error } = await supabase.rpc('delete_message_for_everyone', {
              p_id: Number(m.id),
            });
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            if (playingId === m.id) await stopPlayback();
            markDeleted(m.id);
            if (typeof data === 'string' && data) {
              urlCache.delete(data);
              safe(() => supabase.storage.from(BUCKET).remove([data]));
            }
          },
        },
      ]);
    }, 250);
  };

  // ---------- Block / clear chat ----------
  const confirmBlock = () => {
    setChatMenuVisible(false);
    setTimeout(() => {
      Alert.alert(
        `Block ${name}?`,
        'They will not be able to send you messages, and you will not be able to message them until you unblock.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase.rpc('block_user', { p_user: otherId });
              if (error) {
                Alert.alert('Error', error.message);
                return;
              }
              setIBlocked(true);
            },
          },
        ],
      );
    }, 250);
  };

  const unblock = async () => {
    setChatMenuVisible(false);
    const { error } = await supabase.rpc('unblock_user', { p_user: otherId });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setIBlocked(false);
  };

  const confirmClearChat = () => {
    setChatMenuVisible(false);
    setTimeout(() => {
      Alert.alert('Clear chat?', 'All messages will be removed from your side only.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('delete_chat_for_me', { p_other: otherId });
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            await stopPlayback();
            setMessages([]);
          },
        },
      ]);
    }, 250);
  };

  // ---------- Voice recording ----------
  const ensureMicPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone permission',
      message: 'Allow the app to record voice messages.',
      buttonPositive: 'OK',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  const stopPlayback = async () => {
    await safe(() => Sound.stopPlayer());
    setPlayingId(null);
    setPaused(false);
    setPlayPos(0);
  };

  const startRecording = async () => {
    if (uploading || recording) return;
    const ok = await ensureMicPermission();
    if (!ok) {
      Alert.alert('Permission needed', 'Please allow microphone access to send voice messages.');
      return;
    }
    try {
      await stopPlayback();
      recordMsRef.current = 0;
      setRecordMs(0);
      Sound.addRecordBackListener((e: any) => {
        recordMsRef.current = e.currentPosition || 0;
        setRecordMs(e.currentPosition || 0);
      });
      await Sound.startRecorder();
      recordingRef.current = true;
      setRecording(true);
    } catch (e: any) {
      Sound.removeRecordBackListener();
      recordingRef.current = false;
      setRecording(false);
      Alert.alert('Recording failed', e?.message || 'Could not start recording.');
    }
  };

  const finishRecording = async (shouldSend: boolean) => {
    if (!recordingRef.current) return;
    try {
      const result: string = await Sound.stopRecorder();
      Sound.removeRecordBackListener();
      recordingRef.current = false;
      setRecording(false);
      if (!shouldSend) return;

      const duration = recordMsRef.current;
      if (duration < MIN_VOICE_MS) {
        Alert.alert('Too short', 'Hold on a bit longer to record a voice message.');
        return;
      }
      const uri = result.startsWith('/') ? `file://${result}` : result;
      await uploadAndSend({
        uri,
        name: `voice-${Date.now()}.m4a`,
        mime: 'audio/mp4',
        size: null,
        kind: 'audio',
        durationMs: duration,
      });
    } catch (e: any) {
      Sound.removeRecordBackListener();
      recordingRef.current = false;
      setRecording(false);
      Alert.alert('Recording failed', e?.message || 'Could not save the recording.');
    }
  };

  // ---------- Voice playback (play / pause / resume) ----------
  const togglePlay = async (item: Msg) => {
    if (!item.filePath) return;

    // Same message: pause or resume from the same position
    if (playingId === item.id) {
      try {
        if (paused) {
          await Sound.resumePlayer();
          setPaused(false);
        } else {
          await Sound.pausePlayer();
          setPaused(true);
        }
      } catch (e) {
        await stopPlayback();
      }
      return;
    }

    // Different message: stop the old one, start the new one
    await stopPlayback();
    const url = await getSignedUrl(item.filePath);
    if (!url) {
      Alert.alert('Error', 'Could not load this voice message.');
      return;
    }
    try {
      setPlayingId(item.id);
      setPaused(false);
      setPlayPos(0);
      setPlayDur(item.durationMs || 0);
      await Sound.startPlayer(url);
    } catch (e: any) {
      setPlayingId(null);
      Alert.alert('Playback failed', e?.message || 'Could not play this voice message.');
    }
  };

  const renderContent = (item: Msg) => {
    if (item.deleted) {
      return (
        <Text style={[styles.deletedText, item.mine ? styles.sentTime : styles.receivedTime]}>
          🚫 This message was deleted
        </Text>
      );
    }
    if (item.kind === 'image' && item.filePath) {
      return (
        <MediaImage
          path={item.filePath}
          onPress={setViewerUrl}
          onLongPress={() => setActionMsg(item)}
        />
      );
    }
    if (item.kind === 'video' && item.filePath) {
      return (
        <TouchableOpacity
          style={styles.videoCard}
          activeOpacity={0.85}
          onPress={() => openVideo(item.filePath as string)}
          onLongPress={() => setActionMsg(item)}>
          <View style={styles.videoPlayCircle}>
            <Text style={styles.videoPlayIcon}>▶</Text>
          </View>
          <Text style={styles.videoMeta} numberOfLines={1}>
            🎥 {item.durationMs ? formatDuration(item.durationMs) : 'Video'}
            {item.fileSize ? `  ·  ${formatSize(item.fileSize)}` : ''}
          </Text>
        </TouchableOpacity>
      );
    }
    if (item.kind === 'audio' && item.filePath) {
      const isActive = playingId === item.id;
      const isPlaying = isActive && !paused;
      const total = isActive && playDur ? playDur : item.durationMs || 0;
      const progress = isActive && total ? Math.min(1, playPos / total) : 0;
      return (
        <View style={styles.voiceRow}>
          <TouchableOpacity
            style={[styles.playBtn, item.mine ? styles.playBtnSent : styles.playBtnReceived]}
            activeOpacity={0.8}
            onPress={() => togglePlay(item)}
            onLongPress={() => setActionMsg(item)}>
            <Text style={[styles.playText, item.mine ? styles.playTextSent : styles.playTextReceived]}>
              {isPlaying ? '❚❚' : '▶'}
            </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={[styles.track, item.mine ? styles.trackSent : styles.trackReceived]}>
              <View
                style={[
                  styles.trackFill,
                  item.mine ? styles.trackFillSent : styles.trackFillReceived,
                  { width: `${progress * 100}%` },
                ]}
              />
            </View>
            <Text style={[styles.voiceTime, item.mine ? styles.sentTime : styles.receivedTime]}>
              {formatDuration(isActive ? playPos : total)}
            </Text>
          </View>
        </View>
      );
    }
    if (item.kind === 'file' && item.filePath) {
      return (
        <TouchableOpacity
          style={styles.fileRow}
          activeOpacity={0.8}
          onPress={() => openFile(item.filePath as string)}
          onLongPress={() => setActionMsg(item)}>
          <View style={[styles.fileIcon, item.mine ? styles.fileIconSent : styles.fileIconReceived]}>
            <Text style={styles.fileIconText}>📄</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text
              style={[styles.fileName, item.mine ? styles.sentText : styles.receivedText]}
              numberOfLines={2}>
              {item.fileName || 'File'}
            </Text>
            <Text style={[styles.fileSize, item.mine ? styles.sentTime : styles.receivedTime]}>
              {formatSize(item.fileSize)}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <Text style={[styles.messageText, item.mine ? styles.sentText : styles.receivedText]}>
        {item.text || ''}
      </Text>
    );
  };

  const hasText = message.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={200}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Avatar name={name} path={avatarPath} size={42} />
        </View>
        <Text style={styles.contactName} numberOfLines={1}>
          {name}
        </Text>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setChatMenuVisible(true)}>
          <Text style={styles.menuBtnText}>⋮</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <FlatList
          ref={listRef}
          data={messages}
          extraData={{ playingId, paused, playPos, playDur }}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello! 👋</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.9}
              onLongPress={() => setActionMsg(item)}
              style={[styles.bubble, item.mine ? styles.sent : styles.received]}>
              {renderContent(item)}
              <View style={styles.metaRow}>
                <Text style={[styles.time, item.mine ? styles.sentTime : styles.receivedTime]}>
                  {formatTime(item.createdAt)}
                </Text>
                {item.mine && !item.deleted ? (
                  <Text
                    style={[styles.ticks, item.readAt ? styles.ticksSeen : styles.ticksNormal]}>
                    {item.readAt || item.deliveredAt ? '✓✓' : '✓'}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />

        {uploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color="#29b6f6" />
            <Text style={styles.uploadingText}>Sending…</Text>
          </View>
        )}

        {iBlocked ? (
          <View style={styles.blockedBar}>
            <Text style={styles.blockedText} numberOfLines={2}>
              You blocked {name}.
            </Text>
            <TouchableOpacity style={styles.unblockBtn} onPress={unblock}>
              <Text style={styles.unblockText}>Unblock</Text>
            </TouchableOpacity>
          </View>
        ) : recording ? (
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => finishRecording(false)}>
              <Text style={styles.cancelText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.recordBar}>
              <View style={styles.recordDot} />
              <Text style={styles.recordText}>Recording  {formatDuration(recordMs)}</Text>
            </View>
            <TouchableOpacity style={styles.sendBtn} onPress={() => finishRecording(true)}>
              <Text style={styles.sendText}>➤</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn} onPress={openAttachMenu} disabled={uploading}>
              <Text style={styles.attachText}>📎</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Write a message"
              placeholderTextColor="#8aa3b5"
              value={message}
              onChangeText={setMessage}
            />
            {hasText ? (
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={sendMessage}
                disabled={sending || uploading}>
                <Text style={styles.sendText}>➤</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.sendBtn} onPress={startRecording} disabled={uploading}>
                <Text style={styles.sendText}>🎤</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Attach menu (bottom sheet) */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Send</Text>
            <TouchableOpacity style={styles.sheetItem} onPress={() => chooseAttach(pickPhoto)}>
              <Text style={styles.sheetIcon}>🖼️</Text>
              <Text style={styles.sheetText}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => chooseAttach(pickVideo)}>
              <Text style={styles.sheetIcon}>🎥</Text>
              <Text style={styles.sheetText}>Video</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => chooseAttach(pickDocument)}>
              <Text style={styles.sheetIcon}>📄</Text>
              <Text style={styles.sheetText}>Document</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setMenuVisible(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Message actions (long press) */}
      <Modal
        visible={!!actionMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMsg(null)}>
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setActionMsg(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Message</Text>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => actionMsg && deleteForMe(actionMsg)}>
              <Text style={styles.sheetIcon}>🗑️</Text>
              <Text style={styles.sheetText}>Delete for me</Text>
            </TouchableOpacity>
            {actionMsg?.mine && !actionMsg.deleted ? (
              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => actionMsg && deleteForEveryone(actionMsg)}>
                <Text style={styles.sheetIcon}>🚫</Text>
                <Text style={[styles.sheetText, styles.dangerText]}>Delete for everyone</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setActionMsg(null)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Chat menu (⋮) */}
      <Modal
        visible={chatMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChatMenuVisible(false)}>
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setChatMenuVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{name}</Text>
            {iBlocked ? (
              <TouchableOpacity style={styles.sheetItem} onPress={unblock}>
                <Text style={styles.sheetIcon}>✅</Text>
                <Text style={styles.sheetText}>Unblock user</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.sheetItem} onPress={confirmBlock}>
                <Text style={styles.sheetIcon}>⛔</Text>
                <Text style={[styles.sheetText, styles.dangerText]}>Block user</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.sheetItem} onPress={confirmClearChat}>
              <Text style={styles.sheetIcon}>🧹</Text>
              <Text style={styles.sheetText}>Clear chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setChatMenuVisible(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Full screen image */}
      <Modal
        visible={!!viewerUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUrl(null)}>
        <TouchableOpacity
          style={styles.viewer}
          activeOpacity={1}
          onPress={() => setViewerUrl(null)}>
          {viewerUrl && (
            <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" />
          )}
          <Text style={styles.viewerClose}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      {/* Full screen video */}
      <Modal
        visible={!!videoUrl}
        animationType="fade"
        onRequestClose={() => setVideoUrl(null)}>
        <View style={styles.videoModal}>
          {videoUrl && (
            <Video
              source={{ uri: videoUrl }}
              style={styles.videoPlayer}
              resizeMode="contain"
              controls
            />
          )}
          <TouchableOpacity style={styles.videoClose} onPress={() => setVideoUrl(null)}>
            <Text style={styles.videoCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', marginTop: 40, paddingBottom: 65 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { paddingRight: 12, paddingVertical: 4 },
  back: { color: '#12202e', fontSize: 24 },
  headerAvatar: { marginRight: 10 },
  contactName: { color: '#12202e', fontSize: 19, fontWeight: 'bold', flex: 1 },
  menuBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  menuBtnText: { color: '#12202e', fontSize: 24, fontWeight: 'bold' },
  panel: {
    flex: 1,
    backgroundColor: '#e6f6ff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  empty: { color: '#8aa3b5', textAlign: 'center', marginTop: 40, fontSize: 14 },
  bubble: {
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 6,
    borderRadius: 18,
    marginBottom: 8,
    maxWidth: '78%',
  },
  sent: { backgroundColor: '#29b6f6', alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  received: { backgroundColor: '#ffffff', alignSelf: 'flex-start', borderBottomLeftRadius: 5 },
  messageText: { fontSize: 15 },
  deletedText: { fontSize: 14, fontStyle: 'italic' },
  sentText: { color: '#ffffff' },
  receivedText: { color: '#12202e' },
  metaRow: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', marginTop: 3 },
  time: { fontSize: 10 },
  ticks: { fontSize: 12, fontWeight: 'bold', marginLeft: 4, letterSpacing: -2 },
  ticksNormal: { color: 'rgba(255,255,255,0.85)' },
  ticksSeen: { color: '#0d47a1' },
  sentTime: { color: 'rgba(255,255,255,0.75)' },
  receivedTime: { color: '#9ab0c0' },
  image: { width: 220, height: 220, borderRadius: 12, backgroundColor: '#d4eefc' },
  imageCenter: { justifyContent: 'center', alignItems: 'center' },
  imageError: { color: '#8aa3b5', fontSize: 12 },
  videoCard: {
    width: 220,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#12202e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayIcon: { color: '#12202e', fontSize: 20, marginLeft: 3 },
  videoMeta: {
    position: 'absolute',
    left: 10,
    bottom: 8,
    right: 10,
    color: '#ffffff',
    fontSize: 12,
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 4, maxWidth: 230 },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  fileIconSent: { backgroundColor: 'rgba(255,255,255,0.25)' },
  fileIconReceived: { backgroundColor: '#e6f6ff' },
  fileIconText: { fontSize: 20 },
  fileName: { fontSize: 14, fontWeight: '600' },
  fileSize: { fontSize: 11, marginTop: 2 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', width: 210 },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  playBtnSent: { backgroundColor: '#ffffff' },
  playBtnReceived: { backgroundColor: '#29b6f6' },
  playText: { fontSize: 13 },
  playTextSent: { color: '#29b6f6' },
  playTextReceived: { color: '#ffffff' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  trackSent: { backgroundColor: 'rgba(255,255,255,0.35)' },
  trackReceived: { backgroundColor: '#d4eefc' },
  trackFill: { height: 4, borderRadius: 2 },
  trackFillSent: { backgroundColor: '#ffffff' },
  trackFillReceived: { backgroundColor: '#29b6f6' },
  voiceTime: { fontSize: 11, marginTop: 5 },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  uploadingText: { color: '#5b7a90', fontSize: 12, marginLeft: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  attachText: { fontSize: 18 },
  input: {
    flex: 1,
    backgroundColor: '#ffffff',
    color: '#12202e',
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginRight: 8,
    fontSize: 15,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#29b6f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendText: { color: 'white', fontSize: 18 },
  blockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 26,
    backgroundColor: '#ffffff',
  },
  blockedText: { color: '#5b7a90', fontSize: 14, flex: 1, marginRight: 10 },
  unblockBtn: {
    backgroundColor: '#29b6f6',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  unblockText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  cancelBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  cancelText: { color: '#e5484d', fontSize: 18, fontWeight: 'bold' },
  recordBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginRight: 8,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e5484d',
    marginRight: 10,
  },
  recordText: { color: '#12202e', fontSize: 15 },
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
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: { width: '100%', height: '85%' },
  viewerClose: { color: '#9ab0c0', fontSize: 12, marginTop: 12 },
  videoModal: { flex: 1, backgroundColor: '#000000', justifyContent: 'center' },
  videoPlayer: { width: '100%', height: '100%' },
  videoClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoCloseText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
});