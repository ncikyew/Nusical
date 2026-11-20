// Nusical: lists the YouTube channel's videos for the Videos tab.
// The API key lives in a Netlify environment variable (YT_KEY), never in the code or on GitHub.
// Netlify's CDN keeps each answer for an hour, so YouTube is asked at most about 24 times a day.

const HANDLE = '@nusical-music';
const API = 'https://www.googleapis.com/youtube/v3/';

async function yt(path, params, key){
  const u = new URL(API + path);
  for(const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('key', key);
  const r = await fetch(u);
  if(!r.ok) throw new Error(`YouTube ${path} ${r.status}`);
  return r.json();
}

async function playlistItems(id, max, key){
  const out = []; let page = '';
  do{
    const j = await yt('playlistItems', {part:'snippet', playlistId:id, maxResults:50, ...(page ? {pageToken:page} : {})}, key);
    for(const it of j.items || []){
      const s = it.snippet, vId = s.resourceId && s.resourceId.videoId;
      if(!vId || /^(Private|Deleted) video$/.test(s.title)) continue;
      const th = s.thumbnails || {};
      out.push({id:vId, title:s.title, date:s.publishedAt, thumb:(th.medium || th.high || th.default || {}).url || ''});
    }
    page = j.nextPageToken || '';
  } while(page && out.length < max);
  return out;
}

export default async () => {
  const key = process.env.YT_KEY;
  if(!key) return Response.json({error:'YT_KEY is not set'}, {status:500});
  try{
    const ch = await yt('channels', {part:'contentDetails', forHandle:HANDLE}, key);
    const c = (ch.items || [])[0];
    if(!c) throw new Error('channel not found');
    const list = await playlistItems(c.contentDetails.relatedPlaylists.uploads, 500, key);
    // The channel's playlists become the composer filter (e.g. "Mozart").
    const pl = await yt('playlists', {part:'snippet', channelId:c.id, maxResults:50}, key);
    const composers = [];
    for(const p of (pl.items || []).slice(0, 12)){
      const ids = (await playlistItems(p.id, 200, key)).map(v => v.id);
      if(ids.length) composers.push({name:p.snippet.title, ids});
    }
    return Response.json({list, composers}, {headers:{
      'Cache-Control': 'public, max-age=300',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400'
    }});
  }catch(e){
    return Response.json({error:String(e.message || e)}, {status:502, headers:{'Cache-Control':'no-store'}});
  }
};

export const config = { path: '/api/videos' };
