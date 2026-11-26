# Strongest vs average, per channel (measured)

Source: YouTube Data API through the Worker `/api/ideas` (`tools/research/collect.mjs`), checked 2026-11-21. 166 videos, published 2025-11-26 to 2026-11-12.

**Bias, stated plainly:** the search returns the most-viewed videos, so "rest" means "the weaker ones among the top results", not the channel's real average. The channel's true mean views per video is the `ch.avg` column (from the API's channel statistics). Chapters and thumbnails are not in this route yet.

| Channel | n | top-3 median views | top-3 median min | rest median views | rest median min | ch.avg views | best video |
|---|---|---|---|---|---|---|---|
| Mark Felton Productions | 27 | 1.9M | 14.8 | 0.7M | 14.0 | 1.0M | [The Shocking State of Britain's Navy 2026](https://youtu.be/Gru2EDJvj9Q) (2026-03-22) |
| Veritasium | 20 | 22.3M | 55.0 | 11.5M | 35.4 | 8.6M | [The Closest Thing We Have to Alien Technology](https://youtu.be/MiUHjLxm3V0) (2025-12-31) |
| fern | 18 | 11.6M | 20.8 | 6.4M | 30.7 | 5.1M | [The Only Nazi Hitler Feared](https://youtu.be/VKXQnBlzqzs) (2026-02-15) |
| Wendover Productions | 18 | 1.8M | 16.9 | 1.1M | 18.7 | 2.9M | [How the Channel Tunnel Works](https://youtu.be/gLkbK8h_9fc) (2026-09-04) |
| Johnny Harris | 11 | 7.9M | 60.3 | 4.4M | 50.4 | 2.4M | [The Modern Middle East, Explained](https://youtu.be/bLOEhycMG78) (2026-03-13) |
| Cleo Abram | 10 | 10.2M | 18.2 | 2.5M | 39.1 | 5.0M | [What's Hidden Under Antarctica?](https://youtu.be/XfGEMCb6BQU) (2026-05-09) |
| Kurzgesagt – In a Nutshell | 9 | 12.5M | 17.5 | 7.1M | 14.9 | 10.0M | [AI Just Crossed the Terrifying Line - Now What?](https://youtu.be/ujkD4SxPKOI) (2026-10-05) |
| Yarnhub | 9 | 11.0M | 18.9 | 5.9M | 79.2 | 2.6M | [How the Mighty Scharnhorst Was Sunk](https://youtu.be/d7KRJ1YUKFs) (2025-12-19) |
| Overly Sarcastic Productions | 8 | 0.9M | 136.0 | 0.2M | 28.5 | 0.9M | [Legends Summarized: The Gods of Greece](https://youtu.be/BeEOwEPEBx4) (2026-05-29) |
| Ruhi Cenet Documentaries | 6 | 55.1M | 29.3 | 34.9M | 16.7 | 8.0M | [America’s Most Secretive Jewish Community: Hasidic](https://youtu.be/l6UtZ-u9CyM) (2026-08-26) |
| Alex O'Connor | 5 | 0.3M | 134.2 | 0.2M | 54.6 | 0.7M | [Are We Alone in the Universe? - Hank Green](https://youtu.be/EgLbYhnK30Y) (2025-12-07) |
| National Geographic España | 4 | 5.5M | 44.2 | 3.0M | 44.3 | 0.1M | [El fin de “El Chapo” Guzmán / ESPECIAL / NATIONAL ](https://youtu.be/cdMkZqxERQU) (2026-02-26) |

## Reading (my reading, from the table, not a rule)
- Cleo Abram (18 vs 39 min), Yarnhub (19 vs 79) and Fern (21 vs 31) are strongest when **shorter**; Veritasium (55 vs 35), Johnny Harris (60 vs 50) and Ruhi Çenet (29 vs 17) when **longer**. Length alone does not explain strength; it depends on the channel.
- Top titles name a **person, place or secret** ("The Only Nazi Hitler Feared", "What's Hidden Under Antarctica?", "30 Days on a Death Ship"); weaker ones in the same channel are series, round-ups or topical news ("Epic Naval Battles", "Why Texas Wins").
- Ruhi Çenet's English channel median of the top 3 is 55.1M: the owner's "Bollywood level" target (70-80M) is that channel's top end (best: 92.3M).
