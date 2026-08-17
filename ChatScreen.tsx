import { supabase } from './supabase';
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';

export default function ChatScreen({ navigation, route }: any) {
  const { name } = route.params;
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ id: string, text: string, sent: boolean }[]>([]);

  React.useEffect(() => {
  loadMessages();
}, []);

const sendMessage = () => {
  if (message === '') return;
  saveMessages(message);
  setMessage('');
  loadMessages(); // ye add karo
};

const saveMessages = async (text: string) => {
  await supabase
    .from('messages')
    .insert({ text: text, sender: 'me', receiver: name });
};

const loadMessages = async () => {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('receiver', name)
    .order('created_at', { ascending: true });
  if (data) {
    setMessages(data.map((msg: any) => ({
      id: msg.id.toString(),
      text: msg.text,
      sent: msg.sender === 'me',
    })));
  }
};



  return (
   <KeyboardAvoidingView
  style={styles.container}
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={200}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.contactName}>{name}</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.sent ? styles.sent : styles.received]}>
            <Text style={styles.messageText}>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#888"
          value={message}
          onChangeText={(text) => setMessage(text)}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
container: { flex: 1, backgroundColor: '#1a1a2e', padding: 20, marginTop: 40, paddingBottom: 65 },
  back: { color: 'white', fontSize: 18, marginBottom: 10 },
  contactName: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  bubble: { padding: 10, borderRadius: 10, marginBottom: 8, maxWidth: '75%' },
  sent: { backgroundColor: '#4a4a8a', alignSelf: 'flex-end' },
  received: { backgroundColor: '#2a2a4e', alignSelf: 'flex-start' },
  messageText: { color: 'white', fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  input: { flex: 1, backgroundColor: '#2a2a4e', color: 'white', borderRadius: 20, padding: 10, marginRight: 8 },
  sendBtn: { backgroundColor: '#4a4a8a', padding: 10, borderRadius: 20 },
  sendText: { color: 'white' },
});