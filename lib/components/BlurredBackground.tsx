import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useColors } from '@lib/hooks/useColors';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, ImageSource } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';

export type BlurredBackgroundProps = {
    source: ImageSource;
    cacheKey?: string;
    animated?: boolean;
}

type BlurLayer = {
    source: ImageSource;
    key: number;
}

/**
 * Each layer wraps the Image in an Animated.View that fades 0→1.
 * The Image has a static opacity of 0.6 inside, so the final visible 
 * brightness is always 0.6. Because the wrapper goes to opacity 1.0,
 * it fully covers layers below — no additive brightening.
 */
function FadeInLayer({ layer, onReady, immediate }: { layer: BlurLayer; onReady: (key: number) => void; immediate?: boolean }) {
    const wrapperOpacity = useSharedValue(immediate ? 1 : 0);

    const onLoad = useCallback(() => {
        if (immediate) {
            onReady(layer.key);
            return;
        }
        wrapperOpacity.value = withTiming(1, { duration: 400 }, (finished) => {
            if (finished) runOnJS(onReady)(layer.key);
        });
    }, [layer.key, immediate]);

    const wrapperStyle = useAnimatedStyle(() => ({
        opacity: wrapperOpacity.value,
    }));

    return (
        <Animated.View style={[wrapperViewStyle, wrapperStyle]}>
            <Image
                style={imageStyle}
                source={layer.source}
                blurRadius={500}
                cachePolicy="disk"
                onLoad={onLoad}
            />
        </Animated.View>
    );
}

const wrapperViewStyle = {
    position: 'absolute' as const,
    width: '100%' as const,
    height: '100%' as const,
    backgroundColor: '#000',
};

const imageStyle = {
    width: '100%' as const,
    height: '100%' as const,
    opacity: 0.6,
    objectFit: 'cover' as const,
};

export default function BlurredBackground({ source, cacheKey }: BlurredBackgroundProps) {
    const colors = useColors();

    const styles = useMemo(() => StyleSheet.create({
        background: {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            zIndex: 0,
        },
        imageContainer: {
            flex: 1,
        },
        gradient: {
            position: 'absolute',
            zIndex: 1,
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        }
    }), [colors.background]);

    const imageSource = useMemo(() => ({ ...source, cacheKey }), [(source as any)?.uri, cacheKey]);
    const currentUri = (imageSource as any)?.uri;
    const seqRef = useRef(0);
    const prevUri = useRef(currentUri);

    const [layers, setLayers] = useState<BlurLayer[]>(() => [
        { source: imageSource, key: 0 }
    ]);

    useEffect(() => {
        if (currentUri !== prevUri.current) {
            prevUri.current = currentUri;
            const newKey = ++seqRef.current;
            setLayers(prev => [...prev, { source: imageSource, key: newKey }]);
        }
    }, [currentUri]);

    // When a layer finishes fading in, remove all layers below it
    const onLayerReady = useCallback((readyKey: number) => {
        setLayers(prev => {
            const idx = prev.findIndex(l => l.key === readyKey);
            if (idx > 0) return prev.slice(idx);
            return prev;
        });
    }, []);

    return (
        <View style={styles.background}>
            <View style={styles.imageContainer}>
                {layers.map((layer) => (
                    <FadeInLayer
                        key={layer.key}
                        layer={layer}
                        onReady={onLayerReady}
                        immediate={layer.key === 0}
                    />
                ))}
            </View>
            <LinearGradient style={styles.gradient} colors={[colors.background + '50', colors.background + '90']} />
        </View>
    )
}