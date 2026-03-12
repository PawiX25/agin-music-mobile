import { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { useColors } from '@lib/hooks/useColors';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, ImageSource } from 'expo-image';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
    cancelAnimation,
} from 'react-native-reanimated';

export type BlurredBackgroundProps = {
    source: ImageSource;
    cacheKey?: string;
    animated?: boolean;
};

const absoluteFill = {
    position: 'absolute' as const,
    width: '100%' as const,
    height: '100%' as const,
};

const fullImage = {
    width: '100%' as const,
    height: '100%' as const,
    objectFit: 'cover' as const,
};

/**
 * Two permanently-mounted image layers at FULL opacity, with a static dark
 * overlay on top that provides consistent dimming.
 *
 * The overlay composites uniformly regardless of which layer is active,
 * eliminating the alternating brightness caused by Android's different
 * compositing paths for direct Views vs Animated.Views under parent opacity.
 */
export default function BlurredBackground({ source, cacheKey }: BlurredBackgroundProps) {
    const colors = useColors();

    const styles = useMemo(
        () =>
            StyleSheet.create({
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
                    backgroundColor: '#000',
                },
                darkOverlay: {
                    ...absoluteFill,
                    backgroundColor: '#000',
                    opacity: 0.4,
                },
                gradient: {
                    position: 'absolute',
                    zIndex: 1,
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                },
            }),
        [colors.background],
    );

    const gradientColors = useMemo(
        () => [colors.background + '50', colors.background + '90'] as const,
        [colors.background],
    );

    const imageSource = useMemo(
        () => ({ ...source, cacheKey }),
        [(source as any)?.uri, cacheKey],
    );
    const currentUri = (imageSource as any)?.uri;
    const prevUri = useRef(currentUri);

    // --- Two permanent layers ---
    const [source0, setSource0] = useState<ImageSource>(imageSource);
    const [source1, setSource1] = useState<ImageSource>(imageSource);

    // Track each layer's current URI so we can skip loads when already cached
    const uri0 = useRef(currentUri);
    const uri1 = useRef(currentUri);

    // topOpacity: 0 → layer 0 visible, 1 → layer 1 visible
    const topOpacity = useSharedValue(0);
    const activeLayer = useRef<0 | 1>(0);
    const pendingLayer = useRef<0 | 1 | null>(null);
    const generation = useRef(0);

    const commitSwap = useCallback((layer: 0 | 1, gen: number) => {
        if (gen !== generation.current) return;
        activeLayer.current = layer;
        pendingLayer.current = null;
    }, []);

    const startFade = useCallback(
        (targetLayer: 0 | 1) => {
            const gen = generation.current;
            const to = targetLayer === 1 ? 1 : 0;
            topOpacity.value = withTiming(to, { duration: 400 }, (finished) => {
                if (finished) runOnJS(commitSwap)(targetLayer, gen);
            });
        },
        [commitSwap],
    );

    useEffect(() => {
        if (currentUri !== prevUri.current) {
            prevUri.current = currentUri;
            generation.current++;
            cancelAnimation(topOpacity);
            topOpacity.value = activeLayer.current === 1 ? 1 : 0;

            const target: 0 | 1 = activeLayer.current === 0 ? 1 : 0;

            if (target === 0) {
                if (uri0.current === currentUri) {
                    pendingLayer.current = null;
                    startFade(0);
                } else {
                    uri0.current = currentUri;
                    pendingLayer.current = 0;
                    setSource0(imageSource);
                }
            } else {
                if (uri1.current === currentUri) {
                    pendingLayer.current = null;
                    startFade(1);
                } else {
                    uri1.current = currentUri;
                    pendingLayer.current = 1;
                    setSource1(imageSource);
                }
            }
        }
    }, [currentUri, imageSource, startFade]);

    const onLayer0Load = useCallback(() => {
        if (pendingLayer.current === 0) startFade(0);
    }, [startFade]);

    const onLayer1Load = useCallback(() => {
        if (pendingLayer.current === 1) startFade(1);
    }, [startFade]);

    const topStyle = useAnimatedStyle(() => ({
        ...absoluteFill,
        opacity: topOpacity.value,
    }));

    return (
        <View style={styles.background}>
            <View style={styles.imageContainer}>
                <Image
                    style={[absoluteFill, fullImage]}
                    source={source0}
                    blurRadius={500}
                    cachePolicy="disk"
                    onLoad={onLayer0Load}
                />
                <Animated.View style={topStyle}>
                    <Image
                        style={[absoluteFill, fullImage]}
                        source={source1}
                        blurRadius={500}
                        cachePolicy="disk"
                        onLoad={onLayer1Load}
                    />
                </Animated.View>
                <View style={styles.darkOverlay} />
            </View>
            <LinearGradient style={styles.gradient} colors={gradientColors} />
        </View>
    );
}