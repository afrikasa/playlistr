// Mock Hip-Hop / Rap tracks with album cover URLs.
// Statuses: queued | downloading | done | failed | skipped

const COVER_KENDRICK =
    "https://images.unsplash.com/photo-1506628150-ab62050f199c?crop=entropy&cs=srgb&fm=jpg&w=400&q=80";
const COVER_DRAKE =
    "https://images.pexels.com/photos/15578335/pexels-photo-15578335.png?auto=compress&cs=tinysrgb&dpr=2&h=400&w=400";
const COVER_JCOLE =
    "https://images.pexels.com/photos/13069544/pexels-photo-13069544.png?auto=compress&cs=tinysrgb&dpr=2&h=400&w=400";
const COVER_TRAVIS =
    "https://images.unsplash.com/photo-1518972559570-7cc1309f3229?crop=entropy&cs=srgb&fm=jpg&w=400&q=80";
const COVER_FUTURE =
    "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?crop=entropy&cs=srgb&fm=jpg&w=400&q=80";
const COVER_TYLER =
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?crop=entropy&cs=srgb&fm=jpg&w=400&q=80";

export const PLAYLIST_META = {
    name: "Top Hip-Hop Hits",
    owner: "Spotify",
    tracksTotal: 10,
    cover: COVER_KENDRICK,
};

export const MOCK_TRACKS = [
    {
        id: "t01",
        title: "HUMBLE.",
        artist: "Kendrick Lamar",
        album: "DAMN.",
        duration: "2:57",
        cover: COVER_KENDRICK,
    },
    {
        id: "t02",
        title: "God's Plan",
        artist: "Drake",
        album: "Scorpion",
        duration: "3:18",
        cover: COVER_DRAKE,
    },
    {
        id: "t03",
        title: "No Role Modelz",
        artist: "J. Cole",
        album: "2014 Forest Hills Drive",
        duration: "4:52",
        cover: COVER_JCOLE,
    },
    {
        id: "t04",
        title: "SICKO MODE",
        artist: "Travis Scott",
        album: "ASTROWORLD",
        duration: "5:12",
        cover: COVER_TRAVIS,
    },
    {
        id: "t05",
        title: "Mask Off",
        artist: "Future",
        album: "FUTURE",
        duration: "3:24",
        cover: COVER_FUTURE,
    },
    {
        id: "t06",
        title: "Money Trees",
        artist: "Kendrick Lamar",
        album: "good kid, m.A.A.d city",
        duration: "6:26",
        cover: COVER_KENDRICK,
    },
    {
        id: "t07",
        title: "In My Feelings",
        artist: "Drake",
        album: "Scorpion",
        duration: "3:37",
        cover: COVER_DRAKE,
    },
    {
        id: "t08",
        title: "MIDDLE CHILD",
        artist: "J. Cole",
        album: "Revenge of the Dreamers III",
        duration: "3:33",
        cover: COVER_JCOLE,
    },
    {
        id: "t09",
        title: "EARFQUAKE",
        artist: "Tyler, The Creator",
        album: "IGOR",
        duration: "2:50",
        cover: COVER_TYLER,
    },
    {
        id: "t10",
        title: "DNA.",
        artist: "Kendrick Lamar",
        album: "DAMN.",
        duration: "3:06",
        cover: COVER_KENDRICK,
    },
];

// Predetermined outcomes so the demo has a mix of done/failed/skipped.
// 8 done, 1 failed, 1 skipped → matches a realistic run.
export const TRACK_OUTCOMES = {
    t01: "done",
    t02: "done",
    t03: "done",
    t04: "failed",
    t05: "done",
    t06: "done",
    t07: "skipped",
    t08: "done",
    t09: "done",
    t10: "done",
};
