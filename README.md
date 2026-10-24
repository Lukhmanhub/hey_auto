# Hey Auto (ഹേ ഓട്ടോ)

An open-world auto-rickshaw driving game set in Thekkumpuram, a fictional Kerala town. You drive the auto, pick up passengers, and take them to their destination by the meter. Break the traffic rules and you lose stars and pay fines.

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # static build in dist/
```

## How it plays

- **Pickup → drop**: go to the yellow beam and stop next to the passenger (under 5 km/h) to let them board. Then drive to the green beam. The minimap shows the GPS route, which follows one-way roads.
- **Meter**: ₹30 minimum for 1.5 km, then ₹15 per km. The town is drawn at 1:5 scale, so the meter shows real-world kilometres. A clean trip that arrives on time earns a tip.
- **Rules**: the AI cameras fine you for red signals, wrong-way driving on one-ways, going over 40 km/h, and hitting pedestrians. If you have a passenger, keeping to the wrong side of the road, driving on the footpath, or crashing costs you stars.
- **Shortcuts**: the *idavazhi* alleys (brown on the minimap) cut through compounds, and the paddy fields are mud you can drive across slowly. Using them, you can skip signals and one-way detours.
- **Monsoon** (`R`): rain makes the roads wet. Brakes and steering get weaker, pedestrians open umbrellas, and your headlight comes on.

- **Auto radio** (`Q` next, `Shift+Q` back): **live** Akashvani Kerala stations (Ananthapuri FM, Real FM Kozhikode, Kochi FM, Akashvani Malayalam) and Kerala community and net radio (Radio Suno, Radio Macfast, Radio Kochi, Ahalia FM and more). On start, the radio also pulls trending Malayalam stations from the free [Radio Browser API](https://www.radio-browser.info). HLS streams play through hls.js, and dead streams are skipped automatically. After the live stations come three generated studio stations: Chenda FM (melam), Melody 94.3 (flute and tabla, raga Mohanam) and Kshetram 98.6 (nadaswaram and thavil). Everything plays through a dashboard-speaker filter. Radio Mango, Club FM and Red FM have no public streams, so the game can't play them.
- **Posters**: Malayalam film posters from `public/posters/` are pasted in repeated rows on laterite compound walls, along alley walls, on house sides and electric poles, and on two-sided flex hoardings by the paddy fields. Each poster has a fresh copy and a sun-faded, rain-stained, torn copy. To use your own, replace the files `01.jpg`…`10.jpg`.
- **Political posters** (`public/posters/political/01–07.jpg`): large framed flex boards on poles at junction corners facing the crossing, big banners on the upper floors of buildings, rows on compound walls, and the outer hoardings. Red and tricolour flag bunting is strung along some roads. They're printed flex, so they stay bright and keep clean edges.
- **Soundscape**: crows, koels, the temple bell and church bells (panned by direction and quieter with distance), chatter near the market and bus stand, and frogs in the rain.
- **Street reactions**: pedestrians you hit or nearly hit, bystanders, drivers you crash into, drivers honking at you, and two AI drivers arguing after a bump all react in speech bubbles above them. Each bubble shows Malayalam script with Manglish and English below it.
- **Feedback**: camera shake, a red hit flash, controller rumble, and phone vibration where supported.

Controls: `W/S` throttle, brake and reverse · `A/D` steer · `Space` hand brake · `H` horn · `C` camera (chase / high / driver seat) · `Q` radio station · `[` `]` radio volume · `R` rain · `M` mute · `P` pause · `/` hide hints.
Gamepad (Xbox layout): left stick steers · RT drives · LT brakes · A hand brake · B horn · X radio · Y camera · Start pause.

## HUD

The HUD brings forward what matters for the current state and dims the rest:
- **Cruising:** speedometer and minimap.
- **Ride request:** the phone on the dash mount buzzes and slides in.
- **On trip:** the fare meter, with its tin FOR HIRE flag folding down, and the destination on the phone. The phone's ring shows the passenger's mood, and the meter shows the time.

Earnings sit top-left: the day starts with the auto's ₹250 rent paid, so the aim is ₹800 net. Dialogue appears top-centre and fades after 4 seconds. The radio is a small chip that opens when you press `Q`. Going over 40 km/h turns the needle red and makes the limit sign pulse. The fare meter ticks as the fare rises, and a trip ends with a count-up of the fare, then the stars, the tip and the passenger's line. `Esc` opens the pause menu, which has HUD size (S/M/L) and the dialogue language (Malayalam only / + Manglish / + English). `/` shows the controls.

## Realism pass

| Area | What's used |
|---|---|
| Light & atmosphere | `postprocessing` (pmndrs): N8AO ambient occlusion, soft bloom, ACES filmic tone mapping, a procedural warm and humid **Kerala colour-grade LUT**, saturation and vignette. Warm haze fog by day, grey-green murk in the monsoon |
| Sky light | Poly Haven HDRIs (CC0) via `RGBELoader` + PMREM: a partly-cloudy sky by day and an overcast one in the rain, so wet roads pick up a reflection |
| Surfaces | Poly Haven textures (CC0): worn asphalt with cracks, **Mangalore clay roof tiles**, laterite (with cut-block joints drawn in code), aged plaster with teak-framed windows, interlock footpaths, grass. They're box-projected in world space, so tiles stay the right size everywhere |
| Monsoon | GPU rain that slants with the wind, splash rings on the ground, puddles that fill in, darker glossy roads, spray from the wheels, and palms bending in the gusts |
| Smoke & dust | Blue-grey two-stroke exhaust from the auto, black diesel smoke from buses pulling away, and red dust in alleys and paddy fields |
| Kerala details | Chaya kadas (tin roof, glass jars, brass samovar, bananas), milk booths, hand-painted wall adverts in Chilanka, swaying coconut palms and banana plants, a painted name and KL number plate on every auto |
| HUD | GSAP for the phone slide-in and buzz, the fare count-up, the star pop, the limit-sign pulse and the dialogue. DSEG7 font on the fare meter with unlit segments. Malayalam in Manjari (UI) and Chilanka (signs, dialogue). Lucide icons |
| Sound | Howler sound bank: drop clips in `public/sounds/` (see its README) and they replace the synth. A KRTC conductor's whistle plays near the bus stand |
| Graphics setting | Pause menu → Graphics Low / Medium / High (AO, MSAA, bloom, shadow size) |
| Dev tuning | Open `http://localhost:5180/?dev` for a Tweakpane panel with fog, sun, sky light, colour grade, bloom, AO, camera, HUD and quality |

`Noto Sans Devanagari` is still loaded on purpose: the railway station board shows the town name in Hindi, Malayalam and English, as real Indian Railways boards do.

## Street life & day events

**Fictional by default.** Every film, party, candidate, business and brand in the default town is invented (`src/prints.js`): six mass films plus a fan-association flex and a vintage black-and-white poster, four fictional parties with their own symbols (coconut palm, boat, umbrella, jackfruit), condolence notices (ആദരാഞ്ജലികൾ), birthday, wedding and festival flex, NEET/KEAM and spoken-English coaching (with the usual misspellings), Gulf visa and travel ads, a jewellery shop, a silk shop, a phone shop, a chitty company and lottery ads. Your own real posters are under **Pause → Posters → My real posters**.

**What's on the streets**
- Posters pasted in layers over older half-torn ones, party slogans painted on walls, and bunting in party colours.
- Yellow-and-black kerbs and speed humps near schools and temples (a passenger complains if you take one fast).
- Red post boxes, milestones, bus shelters painted with a sponsor's name, drains with missing slabs, tangled cables, and crows on the wires.
- Tea stalls, lottery sellers under umbrellas, bakery cases, a ration shop, a photostat shop, an e-Seva centre, a tailor, and hand-painted hotel boards.
- Auto stands with drivers chatting and reading the paper, and a khaki traffic policeman on a junction platform.
- On the roads: government and private buses with painted names and a conductor at the door, an Ambassador taxi, tempos, goods autos, a school van, a fish vendor on a bicycle honking a bulb horn, and cows that stop in the lane.
- People: dogs, school kids, nuns, fisherwomen carrying baskets, and men in mundu or lungi.
- Nature: jackfruit and mango trees, hibiscus and jasmine bushes, and moss on laterite walls.
- The temple has a gopuram, a pond and lit nilavilakku lamps; the church has a grotto; the mosque minarets have green bands; the backwater has a canoe and Chinese fishing nets.

**Day events** are picked at random each shift, or chosen under Pause → Today:

| Day | What changes |
|---|---|
| Monsoon | Rain, puddles, umbrellas, about half the people stay in |
| Hartal | Shutters down, about 12% of traffic, few people out, **fares ×2** |
| Election | Painted slogans on every wall, bunting on almost every road, announcement jeeps with loudspeakers |
| Pooram | Elephant procession circling the temple and blocking the road, chenda melam, pookalam, marigold garlands, fares +20% |
| Christmas eve | Star lanterns on the shop fronts |

## Time & weather

- **Clock:** like GTA, one real second is one game minute, so a full day takes 24 minutes. A clock with a weather icon sits under the minimap, and the shift starts at 7:30 am.
- **Day and night:** the sky and light move through dawn, morning, noon, a golden afternoon, sunset and dusk, then night with stars and the moon.
- **At night:** about half the windows light up, signboards glow, street lamps cast pools of orange light, every vehicle has headlights and tail lights, and fewer people are out.
- **Night charge:** after 10 pm the meter adds 50%, as on real Kerala autos.
- **Weather:** changes on its own every few game hours, between clear, cloudy and rain. A monsoon day rains most of the time.
- **Keys:** `R` still toggles rain yourself, and `T` skips ahead an hour.
- **Speed limit:** 50 km/h.

## People, dust and the radio mix

**People** are rigged, animated characters: Quaternius' CC0 *Universal Base Characters* and *Universal Animation Library*, optimised with gltf-transform into `public/chars/` (about 4.8 MB in total). They're cloned with `SkeletonUtils.clone` and animated with `AnimationMixer`. The animations are walk, idle, talk, sit, drive, a hail with the arm raised, and a fall. Kerala clothing is added in code:
- **Painted onto the body in the shader:** shirts (plain, checked or striped, short or long sleeves), saree blouses with a bare midriff and a pallu over the shoulder, trousers, khaki uniforms, mustaches and chappals.
- **Real skinned cloth that swings when they walk:** mundu with a gold kasavu border, checked lungi, saree with a border, churidar, nun's habit, school skirt.
- **Accessories:** hairstyles, beards, grey hair for old men, nun's veil, police cap, fisherwoman's basket, school backpack, newspaper bundle, and umbrellas in the rain.

Your driver wears a khaki shirt and a mundu. If the character files fail to load, the game falls back to the simple box people.

**Dust**
- Dry-season haze, film grain, a softer bloom that glares in the haze, and floating dust motes catching the sun.
- Red laterite dust on walls, wheels, ledges and roofs, dusty kerb margins, dust kicked up by every vehicle, and the occasional dust devil.
- Signboards, posters and flex are sun-faded and grimy.
- Rain washes it all away.

**Radio mix**
- Every station goes through a compressor, so live FM, mastered much louder, matches the music stations and sits just under the engine.
- It sounds like a small dashboard speaker, muffled when heard from the chase camera, with a faint FM hiss and an occasional crackle.
- It ducks when a passenger speaks.

## Code map

| File | What it does |
|---|---|
| `src/config.js` | Grid size, block types, landmarks, signal junctions, one-way roads |
| `src/world.js` | Builds the town: roads and markings, houses and shops with Malayalam signboards, landmarks, the canal with houseboats, paddy fields, electric poles, signals, colliders |
| `src/models.js` | Low-poly models built in code: the auto, cars, KRTC and private buses, scooters, people in mundu or saree, coconut palms |
| `src/player.js` | Auto physics (bicycle model), kerb height, body roll, collisions |
| `src/traffic.js` | AI vehicles that drive on the left along the junction graph, stop at signals, take turns at junctions, and honk at you |
| `src/pedestrians.js` | People walking the footpaths, who stop for you or fall over if you hit them |
| `src/rules.js` | Detects red-light, one-way, keep-left, speeding and footpath violations |
| `src/missions.js` | Passengers, routing (Dijkstra), meter, ratings, tips, passenger lines in Manglish |
| `src/hud.js` | HUD: analog speedometer, LED fare meter with FOR HIRE flag, ride card, e-Challan and UPI notifications, rotating minimap, speech bubbles above people |
| `src/audio.js`, `src/radio.js` | Engine, horns and the Kerala soundscape; the generative radio stations. All synthesised with Web Audio |
| `src/dialogues.js` | Every line of dialogue, in Malayalam, Manglish and English |
| `src/post.js` | Post-processing chain, Kerala colour-grade LUT, HDRI loading, quality tiers |
| `src/materials.js` | Textured materials, box-projected UVs, laterite and plaster textures generated in code, wet-surface response |
| `src/vfx.js` | GPU rain, splashes and smoke/dust/spray puffs |
| `src/prints.js` | Fictional posters, flex, notices and wall slogans, drawn in code with painted portraits |
| `src/humans.js` | Rigged characters, Kerala clothing (shader-painted plus skinned cloth), animation state, distance-based update and shadow LOD |
| `src/dust.js` | Dust shader layer for every material, print weathering, dusty road margins |
| `src/props.js` | Street furniture, shops, nature, religious details, and the hartal, festival and Christmas layers |

Stack: **Three.js** for rendering and **Vite** for dev and build. Everything else (physics, AI, audio) is plain JavaScript, and the game uses no asset files.

## Next steps toward "realistic"

1. Replace the code-built meshes with glTF models made in Blender (load them with `GLTFLoader`), plus PBR textures.
2. Add proper vehicle physics with `@dimforge/rapier3d-compat` (raycast vehicle, suspension).
3. Add a day/night cycle with streetlights and lit shop fronts, plus post-processing (`postprocessing`: SSAO, bloom).
4. Build a larger map from real Kerala road data (OpenStreetMap export → road graph).
5. For photoreal quality, port the design to Unreal Engine 5 (Chaos Vehicles, World Partition, PCG, Lumen), as in the original stack plan. This prototype's rules, missions and AI logic carry over directly.
