import React, { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { supabase } from './supabase';

const AVATAR_COLORS = ['#29b6f6', '#26c6da', '#5c9cf5', '#4dd0e1', '#42a5f5', '#26a69a'];

export const colorFor = (name: string) => {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

export const avatarUrl = (path: string) =>
  supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;

type Props = {
  name: string;
  path?: string | null;
  size?: number;
};

export default function Avatar({ name, path, size = 50 }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [path]);

  const label = (name || '?')[0]?.toUpperCase();
  const showImage = !!path && !failed;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colorFor(name || '?'),
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}>
      {showImage ? (
        <Image
          source={{ uri: avatarUrl(path as string) }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={{ color: 'white', fontSize: size * 0.4, fontWeight: 'bold' }}>{label}</Text>
      )}
    </View>
  );
}