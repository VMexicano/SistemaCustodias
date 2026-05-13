import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface SessionMenuButtonProps {
  onPress: () => void;
  testID?: string;
}

export default function SessionMenuButton({
  onPress,
  testID,
}: SessionMenuButtonProps): React.JSX.Element {
  return (
    <TouchableOpacity
      testID={testID}
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Abrir menú de sesión"
    >
      <Text style={styles.text}>Menu</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 50,
    backgroundColor: '#1F3864',
    borderRadius: 18,
    height: 36,
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
