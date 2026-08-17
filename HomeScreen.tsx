import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';

const contacts = [
  { id: '1', name: 'Abdul Samad', message: '' },
  { id: '2', name: 'Ali Khan', message: '' },
  { id: '3', name: 'Ahmed', message: '' },
];

export default function HomeScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chats</Text>
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.contact}
            onPress={() => navigation.navigate('Chat', { name: item.name })}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name[0]}</Text>
            </View>
            <View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.message}>{item.message}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', padding: 20, marginTop: 40 },
  title: { color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  contact: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2a2a4e', padding: 15, borderRadius: 10, marginBottom: 10 },
  avatar: { width: 45, height: 45, borderRadius: 25, backgroundColor: '#4a4a8a', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  name: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  message: { color: '#888', fontSize: 13, marginTop: 4 },
});