import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  PanResponder,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';

interface Point {
  x: number;
  y: number;
}

interface Props {
  onSign: (signed: boolean) => void;
  height?: number;
}

export function SignaturePad({ onSign, height = 160 }: Props): React.JSX.Element {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const currentStroke = useRef<Point[]>([]);
  const [signed, setSigned] = useState(false);
  const [padWidth, setPadWidth] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e) => {
        currentStroke.current = [{
          x: e.nativeEvent.locationX,
          y: e.nativeEvent.locationY,
        }];
      },

      onPanResponderMove: (e) => {
        currentStroke.current = [
          ...currentStroke.current,
          { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY },
        ];
        // Throttle re-renders: update state every 8 points
        if (currentStroke.current.length % 8 === 0) {
          setStrokes((prev) => {
            const next = [...prev];
            next[next.length] = [...currentStroke.current];
            return next;
          });
        }
      },

      onPanResponderRelease: () => {
        const finished = [...currentStroke.current];
        currentStroke.current = [];
        setStrokes((prev) => [...prev, finished]);
        setSigned(true);
        onSign(true);
      },
    }),
  ).current;

  function handleClear(): void {
    setStrokes([]);
    currentStroke.current = [];
    setSigned(false);
    onSign(false);
  }

  function handleLayout(e: LayoutChangeEvent): void {
    setPadWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={styles.wrapper}>
      <View
        style={[styles.pad, { height }]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
        accessible={false}
      >
        {/* Render strokes as dot sequences */}
        {strokes.map((stroke, si) =>
          stroke
            .filter((_, i) => i % 2 === 0)
            .map((pt, pi) => (
              <View
                key={`${si}-${pi}`}
                style={[
                  styles.dot,
                  { left: Math.max(0, Math.min(pt.x - 2, padWidth - 4)), top: Math.max(0, pt.y - 2) },
                ]}
              />
            )),
        )}

        {/* Placeholder line */}
        {strokes.length === 0 && (
          <View style={styles.placeholder}>
            <View style={styles.signLine} />
            <Text style={styles.placeholderText}>Firmar aquí</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.status, signed && styles.statusSigned]}>
          {signed ? '✓ Firmado' : 'Sin firma'}
        </Text>
        {signed && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn} accessibilityRole="button">
            <Text style={styles.clearText}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
    marginBottom: 12,
  },
  pad: {
    position: 'relative',
    backgroundColor: '#FAFAFA',
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1F3864',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  signLine: {
    height: 1,
    backgroundColor: '#9CA3AF',
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  status: {
    fontSize: 12,
    color: '#6C757D',
  },
  statusSigned: {
    color: '#28A745',
    fontWeight: '600',
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearText: {
    fontSize: 12,
    color: '#DC3545',
  },
});
