import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useCache, useCoverBuilder, useServer, useSubsonicParams } from '@lib/hooks';
import {
    DownloadManager,
    TrackItem,
    useDownloadActions,
    useDownloadedTracks,
    useDownloadProgress,
    useDownloadStorage,
    DownloadedTrack,
    DownloadProgress,
    DownloadStorageInfo,
} from 'react-native-nitro-player';
import { Child } from '@lib/types';
import qs from 'qs';
import showToast from '@lib/showToast';
import { IconCircleCheck, IconCircleX, IconDownload } from '@tabler/icons-react-native';

export type DownloadContextType = {
    downloadTrack: (child: Child, playlistId?: string) => Promise<void>;
    downloadTrackById: (id: string) => Promise<void>;
    downloadPlaylist: (playlistId: string, tracks: Child[]) => Promise<void>;
    deleteTrack: (trackId: string) => Promise<void>;
    deleteAll: () => Promise<void>;
    cancelDownload: (downloadId: string) => Promise<void>;
    retryDownload: (downloadId: string) => Promise<void>;

    isTrackDownloaded: (trackId: string) => boolean;
    getTrackProgress: (trackId: string) => DownloadProgress | undefined;
    getDownloadingMeta: (trackId: string) => Child | undefined;

    downloadedTracks: DownloadedTrack[];
    activeDownloads: DownloadProgress[];
    refreshDownloaded: () => void;
    isDownloading: boolean;

    storageInfo: DownloadStorageInfo | null;
    formattedSize: string;
    refreshStorage: () => Promise<void>;
}

const initial: DownloadContextType = {
    downloadTrack: async () => { },
    downloadTrackById: async () => { },
    downloadPlaylist: async () => { },
    deleteTrack: async () => { },
    deleteAll: async () => { },
    cancelDownload: async () => { },
    retryDownload: async () => { },
    isTrackDownloaded: () => false,
    getTrackProgress: () => undefined,
    getDownloadingMeta: () => undefined,
    downloadedTracks: [],
    activeDownloads: [],
    refreshDownloaded: () => { },
    isDownloading: false,
    storageInfo: null,
    formattedSize: '0 B',
    refreshStorage: async () => { },
};

export const DownloadContext = createContext<DownloadContextType>(initial);

export default function DownloadProvider({ children }: { children?: React.ReactNode }) {
    const { server } = useServer();
    const params = useSubsonicParams();
    const cover = useCoverBuilder();
    const cache = useCache();

    const actions = useDownloadActions();
    const downloaded = useDownloadedTracks();
    const progress = useDownloadProgress({ activeOnly: true });
    const storage = useDownloadStorage();

    const [downloadingMeta, setDownloadingMeta] = useState<Map<string, Child>>(new Map());
    const initializedRef = useRef(false);

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        DownloadManager.configure({
            maxConcurrentDownloads: 3,
            autoRetry: true,
            maxRetryAttempts: 3,
            downloadArtwork: true,
            backgroundDownloadsEnabled: true,
        });
        DownloadManager.setPlaybackSourcePreference('auto');

        DownloadManager.onDownloadComplete((track) => {
            setDownloadingMeta(prev => {
                const next = new Map(prev);
                next.delete(track.trackId);
                return next;
            });
            showToast({
                title: 'Download Complete',
                subtitle: track.originalTrack.title,
                icon: IconCircleCheck,
            });
            downloaded.refresh();
            storage.refresh();
        });

        DownloadManager.onDownloadStateChange((_downloadId, trackId, state, error) => {
            if (state === 'failed' || state === 'cancelled') {
                setDownloadingMeta(prev => {
                    const next = new Map(prev);
                    next.delete(trackId);
                    return next;
                });
            }
            if (state === 'failed' && error) {
                showToast({
                    title: 'Download Failed',
                    subtitle: error.message,
                    icon: IconCircleX,
                    haptics: 'error',
                });
            }
        });
    }, []);

    const convertToTrackItem = useCallback((child: Child): TrackItem => {
        const streamUrl = `${server.url}/rest/stream?${qs.stringify({ id: child.id, ...params })}`;
        return {
            id: child.id,
            title: child.title ?? '',
            artist: child.artist ?? '',
            album: child.album ?? '',
            duration: child.duration ?? 0,
            url: streamUrl,
            artwork: cover.generateUrl(child.coverArt || child.id),
            extraPayload: { _child: child } as any,
        };
    }, [server.url, params, cover.generateUrl]);

    const downloadTrack = useCallback(async (child: Child, playlistId?: string) => {
        if (DownloadManager.isTrackDownloaded(child.id)) {
            showToast({ title: 'Already Downloaded', subtitle: child.title });
            return;
        }
        if (DownloadManager.isDownloading(child.id)) {
            showToast({ title: 'Already Downloading', subtitle: child.title });
            return;
        }
        const trackItem = convertToTrackItem(child);
        setDownloadingMeta(prev => new Map(prev).set(child.id, child));
        try {
            await actions.downloadTrack(trackItem, playlistId);
            showToast({ title: 'Downloading', subtitle: child.title, icon: IconDownload });
        } catch (e) {
            setDownloadingMeta(prev => {
                const next = new Map(prev);
                next.delete(child.id);
                return next;
            });
            showToast({ title: 'Download Error', subtitle: String(e), haptics: 'error', icon: IconCircleX });
        }
    }, [convertToTrackItem, actions.downloadTrack]);

    const downloadTrackById = useCallback(async (id: string) => {
        const child = await cache.fetchChild(id);
        if (!child) return;
        await downloadTrack(child);
    }, [cache.fetchChild, downloadTrack]);

    const downloadPlaylist = useCallback(async (playlistId: string, tracks: Child[]) => {
        const trackItems = tracks.map(convertToTrackItem);
        tracks.forEach(t => {
            setDownloadingMeta(prev => new Map(prev).set(t.id, t));
        });
        try {
            await actions.downloadPlaylist(playlistId, trackItems);
            showToast({ title: 'Downloading', subtitle: `${tracks.length} tracks`, icon: IconDownload });
        } catch (e) {
            tracks.forEach(t => {
                setDownloadingMeta(prev => {
                    const next = new Map(prev);
                    next.delete(t.id);
                    return next;
                });
            });
            showToast({ title: 'Download Error', subtitle: String(e), haptics: 'error', icon: IconCircleX });
        }
    }, [convertToTrackItem, actions.downloadPlaylist]);

    const deleteTrack = useCallback(async (trackId: string) => {
        await actions.deleteTrack(trackId);
        downloaded.refresh();
        storage.refresh();
    }, [actions.deleteTrack, downloaded.refresh, storage.refresh]);

    const deleteAll = useCallback(async () => {
        await actions.deleteAll();
        downloaded.refresh();
        storage.refresh();
    }, [actions.deleteAll, downloaded.refresh, storage.refresh]);

    const getDownloadingMeta = useCallback((trackId: string): Child | undefined => {
        return downloadingMeta.get(trackId);
    }, [downloadingMeta]);

    return (
        <DownloadContext.Provider value={{
            downloadTrack,
            downloadTrackById,
            downloadPlaylist,
            deleteTrack,
            deleteAll,
            cancelDownload: actions.cancelDownload,
            retryDownload: actions.retryDownload,
            isTrackDownloaded: downloaded.isTrackDownloaded,
            getTrackProgress: progress.getProgress,
            getDownloadingMeta,
            downloadedTracks: downloaded.downloadedTracks,
            activeDownloads: progress.progressList,
            refreshDownloaded: downloaded.refresh,
            isDownloading: progress.isDownloading,
            storageInfo: storage.storageInfo,
            formattedSize: storage.formattedSize,
            refreshStorage: storage.refresh,
        }}>
            {children}
        </DownloadContext.Provider>
    );
}
