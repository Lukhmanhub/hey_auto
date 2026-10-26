// Every line: [Malayalam script, Manglish, English]
const L = (ml, mg, en) => ({ ml, mg, en });
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- Passenger ----------
export const ASK = [
  (d) => L(`ചേട്ടാ, ${d.shortMl} വരെ പോകുമോ?`, `Chetta, ${d.short} vare pokumo?`, `Brother, will you go to ${d.name}?`),
  (d) => L(`${d.shortMl} വരെ ഒന്ന് ഇറക്കാമോ?`, `${d.short} vare onnu irakkamo?`, `Can you drop me at ${d.name}?`),
  (d) => L(`ചേട്ടാ, ${d.shortMl}. കുറച്ച് വേഗം വേണം!`, `Chetta, ${d.short}. Kurachu vegam venam!`, `${d.name}, brother. Bit of a hurry!`),
  (d) => L(`${d.shortMl} — മീറ്റർ ഇടണം കേട്ടോ.`, `${d.short} — meter idanam ketto.`, `${d.name} — put the meter on, okay.`),
];
export const THANKS = [
  L('നന്ദി ചേട്ടാ! നല്ല ഡ്രൈവിംഗ്.', 'Nanni chetta! Nalla driving.', 'Thanks brother! Good driving.'),
  L('കൊള്ളാം, അടിപൊളി യാത്ര!', 'Kollam, adipoli yaathra!', 'Nice, awesome ride!'),
  L('ചില്ലറ വെച്ചോളൂ.', 'Chillara vecholu.', 'Keep the change.'),
];
export const MEH = [
  L('ഹാ, എത്തി. ഇത്രേം മതി.', 'Ha, ethi. Ithrem mathi.', "Well, we got here. That'll do."),
  L('ഇനി സൂക്ഷിച്ച് ഓടിക്ക് കേട്ടോ.', 'Ini sookshichu odikku ketto.', 'Drive more carefully from now on.'),
];
export const ANGRY = [
  L('ഇനി നിങ്ങളുടെ ഓട്ടോയിൽ കേറില്ല!', 'Ini ningalude autoyil kerilla!', 'Never getting in your auto again!'),
  L('ഇത് ഓട്ടോയാണോ, റോളർ കോസ്റ്ററാണോ?', 'Ithu auto aano, roller coaster aano?', 'Is this an auto or a roller coaster?'),
];
export const LATE = L('വൈകിപ്പോയല്ലോ ചേട്ടാ...', 'Vaikippoyallo chetta...', "We're late, brother...");

export const PAX_VIOLATION = {
  red: L('ചേട്ടാ, സിഗ്നൽ ചുവപ്പായിരുന്നു!', 'Chetta, signal chuvappaayirunnu!', 'Brother, that signal was red!'),
  wrongway: L('ഇത് വൺവേ ആണ് ചേട്ടാ!', 'Ithu one-way aanu chetta!', 'This is a one-way, brother!'),
  overspeed: L('പതുക്കെ പോ ചേട്ടാ, ധൃതിയില്ല!', 'Pathukke po chetta, dhrithiyilla!', "Slow down, I'm not in a hurry!"),
  wrongside: L('ഇടത് വശം പിടിക്ക് ചേട്ടാ!', 'Idathu vasham pidikku chetta!', 'Keep to the left, brother!'),
  footpath: L('അയ്യോ, ഫുട്പാത്തിലൂടെയോ?!', 'Ayyo, footpathiloodeyo?!', 'Through the footpath?!'),
  crash: L('അയ്യോ! സൂക്ഷിച്ച് ഓടിക്ക്!', 'Ayyo! Sookshichu odikku!', 'Whoa! Drive carefully!'),
  bump: L('എന്താ ഈ കാണിക്കുന്നേ?', 'Entha ee kaanikkunne?', 'What are you doing?'),
  ped: L('ദൈവമേ! ആളെ ഇടിച്ചല്ലോ!', 'Daivame! Aale idichallo!', 'Oh God! You hit someone!'),
};

// ---------- People on the street ----------
export const PED_HIT = [
  L('എടാ! നിനക്ക് കണ്ണില്ലേ?', 'Eda! Ninakku kannille?', "Hey! Don't you have eyes?"),
  L('അയ്യോ! എന്റെ കാല്!', 'Ayyo! Ente kaalu!', 'Ouch! My leg!'),
  L('ഓട്ടോക്കാരാ, നിർത്തെടാ!', 'Autokkaaraa, nirtheda!', 'Hey, auto guy, stop!'),
  L('പോലീസിനെ വിളിക്കും ഞാൻ!', 'Policine vilikkum njaan!', "I'm calling the police!"),
];
export const PED_HIT_FOOTPATH = L('ഫുട്പാത്ത് നടക്കാനുള്ളതാ!', 'Footpath nadakkaanullathaa!', 'The footpath is for walking!');
export const BYSTANDER = [
  L('അയ്യോ! ആരെങ്കിലും ഓടി വാ!', 'Ayyo! Aarenkilum odi vaa!', 'Oh no! Someone come quick!'),
  L('ഇവനൊക്കെ ആര് ലൈസൻസ് കൊടുത്തു?', 'Ivanokke aaru license koduthu?', 'Who gave this guy a licence?'),
  L('നമ്പർ നോട്ട് ചെയ്യ്!', 'Number note cheyyu!', 'Note down his number!'),
  L('ആരും ഒന്നും ചെയ്യല്ലേ, ഞാൻ വീഡിയോ എടുക്കുവാ!', 'Aarum onnum cheyyalle, njaan video edukkuvaa!', "Nobody do anything, I'm filming!"),
];
export const NEAR_MISS = [
  L('പതുക്കെ!', 'Pathukke!', 'Slow down!'),
  L('ഹോ, തലനാരിഴയ്ക്ക്!', 'Ho, thalanaarizhaykku!', 'Whoa, by a hair!'),
  L('നോക്കി ഓടിക്കെടാ!', 'Nokki odikkeda!', 'Watch where you drive!'),
];

// ---------- Other drivers ----------
export const DRIVER_HIT = {
  car: [
    L('എവിടെ നോക്കിയാടാ ഓടിക്കുന്നേ?', 'Evide nokkiyaada odikkunne?', 'Where are you looking while driving?'),
    L('എന്റെ പുതിയ കാറാ! ഇൻഷുറൻസ് നീ തരുമോ?', 'Ente puthiya caaraa! Insurance nee tharumo?', 'My new car! Will you pay the insurance?'),
    L('ഇറങ്ങി വാടാ ഇങ്ങോട്ട്!', 'Irangi vaada ingottu!', 'Get out here!'),
  ],
  bus: [
    L('ബസ്സിന്റെ മുന്നിൽ കളിക്കല്ലേ മോനേ!', 'Bussinte munnil kalikkalle mone!', "Don't play in front of a bus, kid!"),
    L('ടൈം പോകുന്നു, മാറെടാ!', 'Time pokunnu, maareda!', "I'm losing my timing, move!"),
  ],
  auto: [
    L('അളിയാ, നമ്മളൊക്കെ ഒരേ പണിയല്ലേ!', 'Aliyaa, nammalokke ore paniyalle!', "Bro, we're in the same trade!"),
    L('ഹെഡ്‌ലൈറ്റ് പൊട്ടി! കാശ് വേണം!', 'Headlight potti! Kaashu venam!', 'My headlight broke! Pay up!'),
  ],
  scooter: [
    L('അയ്യോ! ഞാൻ വീണേനെ!', 'Ayyo! Njaan veenene!', "Whoa! I'd have fallen!"),
    L('സൈഡ് തരാൻ പഠിക്ക്!', 'Side tharaan padikku!', 'Learn to give way!'),
  ],
};
Object.assign(DRIVER_HIT, {
  taxi: [L('ടാക്സി ഇപ്പോ വർക്ക്ഷോപ്പിലാ!', 'Taxi ippo workshoppila!', 'Now my taxi goes to the workshop!')],
  tempo: [L('ലോഡ് ഉള്ള വണ്ടിയാ, നോക്കി വാ!', 'Load ulla vandiyaa, nokki vaa!', "It's carrying a load, watch it!")],
  goods: [L('അളിയാ, സാധനം പൊട്ടിയാൽ നീ കാശ് തരുമോ?', 'Aliyaa, saadhanam pottiyaal nee kaashu tharumo?', "Bro, if the goods break, will you pay?")],
  van: [L('പിള്ളേരുണ്ട് വണ്ടിയിൽ! സൂക്ഷിക്ക്!', 'Pillerundu vandiyil! Sookshikku!', 'There are kids in the van! Careful!')],
  fish: [L('എന്റെ മീൻ മുഴുവൻ റോഡിൽ!', 'Ente meen muzhuvan roadil!', 'All my fish is on the road!')],
  jeep: [L('ഇലക്ഷൻ കഴിയട്ടെ, കാണിച്ചു തരാം!', 'Election kazhiyatte, kaanichu tharaam!', "Wait till the election's over, I'll show you!")],
  cow: [L('എന്റെ പശുവിനെ ഇടിച്ചോ?! ഇറങ്ങെടാ!', 'Ente pashuvine idicho?! Irangeda!', 'You hit my cow?! Get out!')],
  elephant: [L('ആനയുടെ മുന്നിൽ കളിക്കല്ലേ! പോ പുറകോട്ട്!', 'Aanayude munnil kalikkalle! Po purakottu!', "Don't mess in front of the elephant! Back off!")],
  // the rich kids who think the road is theirs
  mini: [
    L('എന്റെ ഡാഡി ഇത് അറിഞ്ഞാലുണ്ടല്ലോ!', 'Ente daddy ithu arinjaalundallo!', 'Wait till my daddy hears about this!'),
    L('എന്റെ ഡാഡി എന്നേ രക്ഷിക്കും, താൻ പോടോ!', 'Ente daddy enne rakshikkum, thaan podo!', 'My daddy will save me. Get lost!'),
  ],
  benz: [
    L('എന്റെ ഡാഡി ജഡ്‌ജി ആണ് ചെക്കാ, മാറി നിക്ക്!', 'Ente daddy judge aanu chekkaa, maari nikku!', 'My daddy is a judge, kid. Step aside!'),
  ],
});

// what you shout after a rich kid who hit you and just drove off
export const RICH_VICTIM = [
  L('നിർത്തെടാ! ഇടിച്ചിട്ട് പോകുന്നോ?', 'Nirtheda! Idichittu pokunno?', 'Stop! You hit me and just drive off?'),
  L('അയ്യോ! ആരെങ്കിലും ആ നമ്പർ നോക്ക്!', 'Ayyo! Aarenkilum aa number nokku!', 'Ayyo! Someone get that number!'),
  L('പണക്കാരന്റെ മോനാ, കേസ് ഒന്നും ഉണ്ടാവില്ല...', 'Panakkaarante monaa, case onnum undaavilla...', "Rich man's son. There won't be any case..."),
  L('പോലീസിനെ വിളിക്ക്! ... ഓ, അവർ അവന്റെ ആളാ.', 'Policine vilikku! ... O, avar avante aalaa.', "Call the police! ... Oh, they're on his side."),
];

// street calls and announcements
export const FISH_CALL = [
  L('മീനേ... മത്തി, അയല, ചാള!', 'Meene... mathi, ayala, chaala!', 'Fish! Sardine, mackerel!'),
  L('നല്ല പിടയ്ക്കുന്ന മീൻ!', 'Nalla pidaykkunna meen!', 'Fresh, still-flapping fish!'),
];
export const ANNOUNCE = (p) => [
  L(`പ്രിയപ്പെട്ട നാട്ടുകാരേ, ${p.cand}നെ ${p.symMl} അടയാളത്തിൽ വോട്ട് ചെയ്ത് വിജയിപ്പിക്കുക!`, `Priyappetta naattukaare, ${p.symMl} adayaalathil vote cheyyuka!`, `Dear people, vote for ${p.en} — the ${p.sym} symbol!`),
  L(`ഇന്ന് വൈകിട്ട് ആറിന് ജംഗ്ഷനിൽ പൊതുയോഗം — ${p.ml}`, 'Innu vaikittu aaru mani-kku junctionil pothuyogam!', 'Public meeting at the junction, 6 pm today!'),
];
export const HUMP = [
  L('അയ്യോ! ഹമ്പ് കണ്ടില്ലേ ചേട്ടാ?', 'Ayyo! Hump kandille chetta?', "Ouch! Didn't you see the hump, brother?"),
  L('എന്റെ നടുവ്...!', 'Ente naduvu...!', 'My back...!'),
];
export const DAY_INTRO = {
  normal: L('ഒരു സാധാരണ ദിവസം. ഓട്ടം നോക്കാം!', 'Oru saadhaarana divasam. Ottam nokkaam!', 'An ordinary day. Let\'s find some fares!'),
  monsoon: L('നല്ല മഴയാണ്. ആളുകൾ കുറവ്, കുഴികൾ കൂടുതൽ.', 'Nalla mazhayaanu. Aalukal kuravu, kuzhikal kooduthal.', 'Heavy rain. Fewer people, more potholes.'),
  hartal: L('ഇന്ന് ഹർത്താൽ! കടകൾ അടച്ചു, റോഡ് കാലി.', 'Innu hartal! Kadakal adachu, road kaali.', "It's a hartal! Shops shut, roads empty — fares are double."),
  election: L('ഇലക്ഷൻ ചൂട്! എവിടെ നോക്കിയാലും പോസ്റ്ററും കൊടിയും.', 'Election choodu! Evide nokkiyaalum posterum kodiyum.', 'Election fever — posters and flags everywhere.'),
  festival: L('ഇന്ന് പൂരം! ആനയെഴുന്നള്ളിപ്പ് അമ്പലത്തിനു ചുറ്റും.', 'Innu pooram! Aanayezhunnallippu ambalathinu chuttum.', "It's the temple festival! Elephants around the temple — traffic blocks."),
};

export const HONK = [
  L('ഒന്ന് മാറിക്കേ ചേട്ടാ!', 'Onnu maarikke chetta!', 'Move aside, brother!'),
  L('വഴി മുടക്കാതെ!', 'Vazhi mudakkaathe!', "Don't block the road!"),
  L('എന്താ, ഇവിടെ പാർക്ക് ചെയ്തോ?', 'Entha, ivide park cheytho?', 'What, did you park here?'),
];
// two drivers who bump into each other argue back and forth
export const ARGUMENT = [
  L('നീ എവിടെ നോക്കിയാ വരുന്നേ?', 'Nee evide nokkiyaa varunne?', 'Where were you looking?'),
  L('ഞാനോ? നീയല്ലേ ഇടിച്ചത്!', 'Njaano? Neeyalle idichathu!', 'Me? You hit me!'),
  L('റോഡ് നിന്റെ തറവാട്ടു സ്വത്താണോ?', 'Road ninte tharavaattu swathaano?', 'Is the road your family property?'),
  L('പോടാ!', 'Poda!', 'Get lost!'),
];
