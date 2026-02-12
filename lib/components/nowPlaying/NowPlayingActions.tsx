import { useContext, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ActionIcon from '../ActionIcon';
import { IconCircleCheck, IconDots, IconDownload, IconHeart, IconHeartFilled, IconLoader2 } from '@tabler/icons-react-native';
import { useApiHelpers, useDownloads, useQueue } from '@/lib/hooks';
import { SheetManager } from 'react-native-actions-sheet';
import * as Haptics from 'expo-haptics';
import { IdContext } from '@lib/sheets/playback';

export default function NowPlayingActions() {
    const { nowPlaying, toggleStar } = useQueue();
    const helpers = useApiHelpers();
    const downloads = useDownloads();
    const isDownloaded = downloads.isTrackDownloaded(nowPlaying.id);
    const isDownloading = !!downloads.getTrackProgress(nowPlaying.id);
    const [isStarting, setIsStarting] = useState(false);

    const sheetId = useContext(IdContext);

    const styles = useMemo(() => StyleSheet.create({
        actions: {
            flexDirection: 'row',
            gap: 10,
        }
    }), []);

    const downloadIcon = isDownloaded ? IconCircleCheck : (isDownloading || isStarting) ? IconLoader2 : IconDownload;
    const downloadVariant = isDownloaded ? 'secondaryFilled' : (isDownloading || isStarting) ? 'subtleFilled' : 'secondary';

    return (
        <View style={styles.actions}>
            {/* FIXME */}
            <ActionIcon variant={nowPlaying.starred ? 'secondaryFilled' : 'secondary'} icon={nowPlaying.starred ? IconHeartFilled : IconHeart} size={16} onPress={toggleStar} isFilled={!!nowPlaying.starred} />
            <ActionIcon
                variant={downloadVariant}
                icon={downloadIcon}
                size={16}
                isFilled={isDownloaded}
                disabled={isDownloaded || isDownloading || isStarting}
                onPress={async () => {
                    if (!nowPlaying.id || isDownloaded || isDownloading || isStarting) return;
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setIsStarting(true);
                    try {
                        await downloads.downloadTrackById(nowPlaying.id);
                    } finally {
                        setIsStarting(false);
                    }
                }}
            />
            <ActionIcon variant='secondary' icon={IconDots} size={16} onPress={async () => {
                Haptics.selectionAsync();
                const data = await SheetManager.show('track', {
                    payload: {
                        id: nowPlaying.id,
                        data: nowPlaying,
                        context: 'nowPlaying'
                    }
                });
                if (data.shouldCloseSheet) SheetManager.hide(sheetId);
            }} />
        </View>
    )
}