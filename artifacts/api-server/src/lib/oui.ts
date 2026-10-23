/**
 * Best-effort, offline MAC-prefix (OUI) vendor lookup.
 *
 * This is a curated subset of the IEEE registry covering common phones, laptops
 * and consumer devices — not the full database. Unknown prefixes return null
 * rather than a guess, so an entry here is only shown when it is reliable.
 *
 * To expand later, drop in the full IEEE OUI list (~35k entries, ~2 MB) as a
 * generated map; the lookup below does not need to change.
 */
const VENDORS: Record<string, string> = {
  // Apple
  "001B63": "Apple", "001EC2": "Apple", "0023DF": "Apple", "002500": "Apple",
  "0026BB": "Apple", "3C0754": "Apple", "406C8F": "Apple", "68AB1E": "Apple",
  "7CD1C3": "Apple", "8C8590": "Apple", "A483E7": "Apple", "B8E856": "Apple",
  "D0817A": "Apple", "F01898": "Apple", "F0DBF8": "Apple", "9C35EB": "Apple",
  // Samsung
  "0012FB": "Samsung", "001599": "Samsung", "001632": "Samsung", "08373D": "Samsung",
  "28395E": "Samsung", "3423BA": "Samsung", "5C0A5B": "Samsung", "781FDB": "Samsung",
  "8C7712": "Samsung", "BC20A4": "Samsung", "E8508B": "Samsung", "F40E22": "Samsung",
  // Xiaomi
  "009EC8": "Xiaomi", "286C07": "Xiaomi", "34CE00": "Xiaomi", "508F4C": "Xiaomi",
  "64B473": "Xiaomi", "7811DC": "Xiaomi", "8CBEBE": "Xiaomi", "9C99A0": "Xiaomi",
  "ACC1EE": "Xiaomi", "F0B429": "Xiaomi", "04CF8C": "Xiaomi", "4CE0DB": "Xiaomi",
  // Huawei / Honor
  "009ACD": "Huawei", "04BD70": "Huawei", "246968": "Huawei", "48DB50": "Huawei",
  "5C7D5E": "Huawei", "78D752": "Huawei", "8853D4": "Huawei", "A49947": "Huawei",
  "D07AB5": "Huawei", "E0247F": "Huawei", "F4C714": "Huawei",
  // Intel
  "001B21": "Intel", "001E64": "Intel", "00216A": "Intel", "0024D7": "Intel",
  "3413E8": "Intel", "448500": "Intel", "5CE0C5": "Intel", "7C7A91": "Intel",
  "AC7BA1": "Intel", "B03CDC": "Intel",
  // Google / Nest
  "3C286D": "Google", "546009": "Google", "94EB2C": "Google", "A47733": "Google",
  "F4F5D8": "Google", "F88FCA": "Google",
  // Microsoft
  "00125A": "Microsoft", "00155D": "Microsoft", "281878": "Microsoft",
  "7C1E52": "Microsoft", "C83F26": "Microsoft",
  // Dell
  "001422": "Dell", "180373": "Dell", "24B6FD": "Dell", "5CF9DD": "Dell",
  "B82A72": "Dell", "F8BC12": "Dell",
  // HP
  "001B78": "HP", "001F29": "HP", "3CD92B": "HP", "705A0F": "HP",
  "9CB654": "HP", "B499BA": "HP",
  // Lenovo
  "0012FE": "Lenovo", "109ADD": "Lenovo", "3C970E": "Lenovo", "54EE75": "Lenovo",
  "8C1645": "Lenovo", "C85B76": "Lenovo",
  // Asus
  "001BFC": "Asus", "04D4C4": "Asus", "2C56DC": "Asus", "50465D": "Asus",
  "AC9E17": "Asus", "F832E4": "Asus",
  // Sony
  "0013A9": "Sony", "30F9ED": "Sony", "78843C": "Sony",
  // LG
  "001C62": "LG", "10F1F2": "LG", "88366C": "LG", "C4366D": "LG",
  // Motorola
  "0C9D92": "Motorola", "5C5188": "Motorola", "9CD917": "Motorola", "E82B34": "Motorola",
  // OnePlus
  "64A2F9": "OnePlus", "94652D": "OnePlus", "C0EEFB": "OnePlus", "8C8B83": "OnePlus",
  // Amazon
  "00FC8B": "Amazon", "40B4CD": "Amazon", "6837E9": "Amazon", "74C246": "Amazon",
  "F08173": "Amazon",
  // Nintendo
  "0017AB": "Nintendo", "58BDA3": "Nintendo", "98B6E9": "Nintendo",
  // Roku
  "000D4B": "Roku", "B0A737": "Roku", "CC6DA0": "Roku",
  // TP-Link
  "002719": "TP-Link", "50C7BF": "TP-Link", "A42BB0": "TP-Link", "C025E9": "TP-Link",
  // Raspberry Pi / Espressif (IoT)
  "B827EB": "Raspberry Pi", "DCA632": "Raspberry Pi", "E45F01": "Raspberry Pi",
  "240AC4": "Espressif", "3C71BF": "Espressif", "84CCA8": "Espressif",
  // Foxconn / Hon Hai (covers many budget devices)
  "001EEC": "Foxconn", "0023CD": "Foxconn", "28C68E": "Foxconn", "441CA8": "Foxconn",
  // Realtek
  "00E04C": "Realtek",
  // Virtual
  "525400": "Virtual machine (QEMU)",
  "005056": "Virtual machine (VMware)",
};

export function vendorForMac(mac: string | null | undefined): string | null {
  if (!mac) return null;
  const prefix = mac.replace(/[^0-9a-fA-F]/g, "").toUpperCase().slice(0, 6);
  if (prefix.length !== 6) return null;
  return VENDORS[prefix] ?? null;
}
