import React, { useMemo } from 'react';
import HomeSectionHeader from '../HomeSectionHeader';
import MediaLibraryList from '../MediaLibraryList';
import { usePins, useCoverBuilder, useHomeItemActions } from '@lib/hooks';
import { TMediaLibItem } from '../MediaLibraryList/Item';

export function Pinned() {
    const { pins } = usePins();
    const cover = useCoverBuilder();
    const { press, longPress } = useHomeItemActions();

    const pinsData = useMemo(() => pins.map((pin): TMediaLibItem => ({
        id: pin.id,
        title: pin.name.replace(/\(.*/g, '').trim(),
        coverArt: pin.coverArt,
        coverUri: cover.generateUrl(pin.coverArt, { size: 512 }),
        coverCacheKey: `${pin.coverArt}-512x512`,
        type: pin.type,
    })), [pins]);

    return (
        <>
            {pinsData.length > 0 && <>
                <HomeSectionHeader label="Pinned" description="Your favorite music at a glance" action={{ label: 'Edit', onPress: () => { } }} />
                <MediaLibraryList
                    data={pinsData}
                    onItemPress={press}
                    onItemLongPress={longPress}
                    layout='gridCompact'
                    withTopMargin={false}
                    scrollEnabled={false}
                    isFullHeight={false}
                />
            </>}
        </>
    )
}