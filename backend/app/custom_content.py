import os
import json
from typing import List, Dict, Any
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
from .routers import fake_users_db
from game_core.data_loader import EMPTY_DECK_NAME

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "game_core", "data")
DEFAULT_THREATS_PATH = os.path.join(DATA_DIR, "threats.json")
CUSTOM_THREATS_DIR = os.path.join(DATA_DIR, "custom_threats")
DEFAULT_BOSS_PATH = os.path.join(DATA_DIR, "bosses.json")
DEFAULT_UPGRADES_PATH = os.path.join(DATA_DIR, "upgrades.json")
DEFAULT_WEAPONS_PATH = os.path.join(DATA_DIR, "weapons.json")
THREAT_IMAGE_DIRS = [
    os.path.join(BASE_DIR, "..", "frontend", "src", "images", "cards", "threats"),
]
CUSTOM_IMAGE_DIR = os.path.join(DATA_DIR, "custom_threat_images")
CUSTOM_BOSS_DIR = os.path.join(DATA_DIR, "custom_bosses")
DEFAULT_MARKET_PATH = os.path.join(DATA_DIR, "market.json")
CUSTOM_MARKET_DIR = os.path.join(DATA_DIR, "custom_market")
CUSTOM_UPGRADES_DIR = os.path.join(DATA_DIR, "custom_upgrades")
CUSTOM_WEAPONS_DIR = os.path.join(DATA_DIR, "custom_weapons")
EMPTY_DECK_LABEL = "None (empty)"


def ensure_dirs():
    os.makedirs(CUSTOM_THREATS_DIR, exist_ok=True)
    os.makedirs(CUSTOM_IMAGE_DIR, exist_ok=True)
    os.makedirs(CUSTOM_BOSS_DIR, exist_ok=True)
    os.makedirs(CUSTOM_MARKET_DIR, exist_ok=True)
    os.makedirs(CUSTOM_UPGRADES_DIR, exist_ok=True)
    os.makedirs(CUSTOM_WEAPONS_DIR, exist_ok=True)


def list_json_files(folder: str) -> List[str]:
    if not os.path.isdir(folder):
        return []
    return [f for f in os.listdir(folder) if f.endswith(".json")]


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Dict[str, Any]):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def rename_deck_file(folder: str, current: str, target: str):
    if current == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot rename default deck")
    if not target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target name required")
    src = os.path.join(folder, f"{current}.json")
    dest = os.path.join(folder, f"{target}.json")
    if not os.path.isfile(src):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")
    if os.path.isfile(dest):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target name already exists")
    os.rename(src, dest)


router = APIRouter(prefix="/api/custom")
DEFAULT_CONTENT_STATE = {
    "active_threat_deck": "default",
    "active_boss_deck": "default",
    "active_market_deck": "default",
}


def _content_state():
    # Store in fake_users_db to persist in-memory alongside other fake data
    if "_content_state" not in fake_users_db:
        fake_users_db["_content_state"] = DEFAULT_CONTENT_STATE.copy()
    state = fake_users_db["_content_state"]
    for key, val in DEFAULT_CONTENT_STATE.items():
        state.setdefault(key, val)
    return state


@router.get("/threat-decks")
def list_threat_decks():
    ensure_dirs()
    decks = [
        {"name": "default", "editable": False, "path": DEFAULT_THREATS_PATH},
    ]
    for filename in list_json_files(CUSTOM_THREATS_DIR):
        name = os.path.splitext(filename)[0]
        decks.append({"name": name, "editable": True})
    return {"decks": decks}


@router.get("/threat-decks/{name}")
def get_threat_deck(name: str):
    ensure_dirs()
    if name == "default":
        return load_json(DEFAULT_THREATS_PATH)
    path = os.path.join(CUSTOM_THREATS_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")
    return load_json(path)


@router.post("/threat-decks/{name}")
def save_threat_deck(name: str, deck: Dict[str, Any]):
    ensure_dirs()
    if name == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default deck is read-only")
    path = os.path.join(CUSTOM_THREATS_DIR, f"{name}.json")
    save_json(path, deck)
    return {"status": "ok", "name": name}


@router.delete("/threat-decks/{name}")
def delete_threat_deck(name: str):
    ensure_dirs()
    if name == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete default deck")
    path = os.path.join(CUSTOM_THREATS_DIR, f"{name}.json")
    if os.path.isfile(path):
        os.remove(path)
        return {"status": "deleted"}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")


@router.post("/threat-decks/{name}/clone")
def clone_threat_deck(name: str, payload: Dict[str, Any]):
    ensure_dirs()
    target = payload.get("target")
    if not target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target name required")
    if target == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot overwrite default")

    if name == "default":
        source_path = DEFAULT_THREATS_PATH
    else:
        source_path = os.path.join(CUSTOM_THREATS_DIR, f"{name}.json")

    if not os.path.isfile(source_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source deck not found")

    dest_path = os.path.join(CUSTOM_THREATS_DIR, f"{target}.json")
    with open(source_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    save_json(dest_path, data)
    return {"status": "ok", "name": target}


@router.post("/threat-decks/{name}/rename")
def rename_threat_deck(name: str, payload: Dict[str, Any]):
    ensure_dirs()
    target = payload.get("target")
    rename_deck_file(CUSTOM_THREATS_DIR, name, target)
    return {"status": "ok", "name": target}


@router.get("/active-threat-deck")
def get_active_threat_deck():
    ensure_dirs()
    return {"name": _content_state().get("active_threat_deck", "default")}


@router.post("/active-threat-deck")
def set_active_threat_deck(payload: Dict[str, Any]):
    ensure_dirs()
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name required")
    if name == "default":
        _content_state()["active_threat_deck"] = "default"
        return {"status": "ok", "name": name}
    path = os.path.join(CUSTOM_THREATS_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")
    _content_state()["active_threat_deck"] = name
    return {"status": "ok", "name": name}


# --- MARKET DECK MANAGEMENT ---
@router.get("/market-decks")
def list_market_decks():
    ensure_dirs()
    decks = [{"name": "default", "editable": False, "path": DEFAULT_MARKET_PATH}]
    for filename in list_json_files(CUSTOM_MARKET_DIR):
        name = os.path.splitext(filename)[0]
        decks.append({"name": name, "editable": True})
    return {"decks": decks}


@router.get("/market-decks/{name}")
def get_market_deck(name: str):
    ensure_dirs()
    if name == "default":
        return load_json(DEFAULT_MARKET_PATH)
    path = os.path.join(CUSTOM_MARKET_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")
    return load_json(path)


@router.post("/market-decks/{name}")
def save_market_deck(name: str, deck: Dict[str, Any]):
    ensure_dirs()
    if name == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default deck is read-only")
    path = os.path.join(CUSTOM_MARKET_DIR, f"{name}.json")
    save_json(path, deck)
    return {"status": "ok", "name": name}


@router.delete("/market-decks/{name}")
def delete_market_deck(name: str):
    ensure_dirs()
    if name == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete default deck")
    path = os.path.join(CUSTOM_MARKET_DIR, f"{name}.json")
    if os.path.isfile(path):
        os.remove(path)
        return {"status": "deleted"}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")


@router.post("/market-decks/{name}/clone")
def clone_market_deck(name: str, payload: Dict[str, Any]):
    ensure_dirs()
    target = payload.get("target")
    if not target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target name required")
    if target == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot overwrite default")

    if name == "default":
        source_path = DEFAULT_MARKET_PATH
    else:
        source_path = os.path.join(CUSTOM_MARKET_DIR, f"{name}.json")

    if not os.path.isfile(source_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source deck not found")

    dest_path = os.path.join(CUSTOM_MARKET_DIR, f"{target}.json")
    with open(source_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    save_json(dest_path, data)
    return {"status": "ok", "name": target}


# --- UPGRADE DECK MANAGEMENT ---
@router.get("/upgrade-decks")
def list_upgrade_decks():
    ensure_dirs()
    decks = [{"name": "default", "editable": False, "path": DEFAULT_UPGRADES_PATH}]
    for filename in list_json_files(CUSTOM_UPGRADES_DIR):
        name = os.path.splitext(filename)[0]
        decks.append({"name": name, "editable": True})
    decks.append({"name": EMPTY_DECK_NAME, "editable": False, "label": EMPTY_DECK_LABEL, "empty": True})
    return {"decks": decks}


@router.get("/upgrade-decks/{name}")
def get_upgrade_deck(name: str):
    ensure_dirs()
    if name == "default":
        return load_json(DEFAULT_UPGRADES_PATH)
    if name == EMPTY_DECK_NAME:
        return {"name": EMPTY_DECK_NAME, "upgrades": []}
    path = os.path.join(CUSTOM_UPGRADES_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")
    return load_json(path)


@router.post("/upgrade-decks/{name}")
def save_upgrade_deck(name: str, deck: Dict[str, Any]):
    ensure_dirs()
    if name in {"default", EMPTY_DECK_NAME}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default and empty decks are read-only")
    path = os.path.join(CUSTOM_UPGRADES_DIR, f"{name}.json")
    save_json(path, deck)
    return {"status": "ok", "name": name}


@router.delete("/upgrade-decks/{name}")
def delete_upgrade_deck(name: str):
    ensure_dirs()
    if name in {"default", EMPTY_DECK_NAME}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete default or empty deck")
    path = os.path.join(CUSTOM_UPGRADES_DIR, f"{name}.json")
    if os.path.isfile(path):
        os.remove(path)
        return {"status": "deleted"}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")


@router.post("/upgrade-decks/{name}/clone")
def clone_upgrade_deck(name: str, payload: Dict[str, Any]):
    ensure_dirs()
    target = payload.get("target")
    if not target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target name required")
    if target in {"default", EMPTY_DECK_NAME}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot overwrite default or empty deck")
    if name == EMPTY_DECK_NAME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot clone empty deck")

    if name == "default":
        source_path = DEFAULT_UPGRADES_PATH
    else:
        source_path = os.path.join(CUSTOM_UPGRADES_DIR, f"{name}.json")

    if not os.path.isfile(source_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source deck not found")

    dest_path = os.path.join(CUSTOM_UPGRADES_DIR, f"{target}.json")
    with open(source_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    save_json(dest_path, data)
    return {"status": "ok", "name": target}


@router.post("/upgrade-decks/{name}/rename")
def rename_upgrade_deck(name: str, payload: Dict[str, Any]):
    ensure_dirs()
    target = payload.get("target")
    if name == EMPTY_DECK_NAME or target == EMPTY_DECK_NAME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot rename empty deck")
    rename_deck_file(CUSTOM_UPGRADES_DIR, name, target)
    return {"status": "ok", "name": target}


# --- WEAPON DECK MANAGEMENT ---
@router.get("/weapon-decks")
def list_weapon_decks():
    ensure_dirs()
    decks = [{"name": "default", "editable": False, "path": DEFAULT_WEAPONS_PATH}]
    for filename in list_json_files(CUSTOM_WEAPONS_DIR):
        name = os.path.splitext(filename)[0]
        decks.append({"name": name, "editable": True})
    decks.append({"name": EMPTY_DECK_NAME, "editable": False, "label": EMPTY_DECK_LABEL, "empty": True})
    return {"decks": decks}


@router.get("/weapon-decks/{name}")
def get_weapon_deck(name: str):
    ensure_dirs()
    if name == "default":
        return load_json(DEFAULT_WEAPONS_PATH)
    if name == EMPTY_DECK_NAME:
        return {"name": EMPTY_DECK_NAME, "weapons": []}
    path = os.path.join(CUSTOM_WEAPONS_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")
    return load_json(path)


@router.post("/weapon-decks/{name}")
def save_weapon_deck(name: str, deck: Dict[str, Any]):
    ensure_dirs()
    if name in {"default", EMPTY_DECK_NAME}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default and empty decks are read-only")
    path = os.path.join(CUSTOM_WEAPONS_DIR, f"{name}.json")
    save_json(path, deck)
    return {"status": "ok", "name": name}


@router.delete("/weapon-decks/{name}")
def delete_weapon_deck(name: str):
    ensure_dirs()
    if name in {"default", EMPTY_DECK_NAME}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete default or empty deck")
    path = os.path.join(CUSTOM_WEAPONS_DIR, f"{name}.json")
    if os.path.isfile(path):
        os.remove(path)
        return {"status": "deleted"}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")


@router.post("/weapon-decks/{name}/clone")
def clone_weapon_deck(name: str, payload: Dict[str, Any]):
    ensure_dirs()
    target = payload.get("target")
    if not target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target name required")
    if target in {"default", EMPTY_DECK_NAME}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot overwrite default or empty deck")
    if name == EMPTY_DECK_NAME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot clone empty deck")

    if name == "default":
        source_path = DEFAULT_WEAPONS_PATH
    else:
        source_path = os.path.join(CUSTOM_WEAPONS_DIR, f"{name}.json")

    if not os.path.isfile(source_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source deck not found")

    dest_path = os.path.join(CUSTOM_WEAPONS_DIR, f"{target}.json")
    with open(source_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    save_json(dest_path, data)
    return {"status": "ok", "name": target}


@router.post("/weapon-decks/{name}/rename")
def rename_weapon_deck(name: str, payload: Dict[str, Any]):
    ensure_dirs()
    target = payload.get("target")
    if name == EMPTY_DECK_NAME or target == EMPTY_DECK_NAME:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot rename empty deck")
    rename_deck_file(CUSTOM_WEAPONS_DIR, name, target)
    return {"status": "ok", "name": target}


@router.get("/active-market-deck")
def get_active_market_deck():
    ensure_dirs()
    return {"name": _content_state().get("active_market_deck", "default")}


@router.post("/active-market-deck")
def set_active_market_deck(payload: Dict[str, Any]):
    ensure_dirs()
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name required")
    if name == "default":
        _content_state()["active_market_deck"] = "default"
        return {"status": "ok", "name": name}
    path = os.path.join(CUSTOM_MARKET_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found")
    _content_state()["active_market_deck"] = name
    return {"status": "ok", "name": name}


@router.get("/bosses/default")
def get_default_bosses():
    ensure_dirs()
    if os.path.isfile(DEFAULT_BOSS_PATH):
        return load_json(DEFAULT_BOSS_PATH)
    # Fallback: extract bosses from default threats file if bosses.json not present
    data = load_json(DEFAULT_THREATS_PATH)
    return {"bosses": data.get("bosses", [])}


@router.get("/boss-decks")
def list_boss_decks():
    ensure_dirs()
    bosses = [{"name": "default", "editable": False, "path": DEFAULT_BOSS_PATH}]
    for filename in list_json_files(CUSTOM_BOSS_DIR):
        name = os.path.splitext(filename)[0]
        bosses.append({"name": name, "editable": True})
    return {"decks": bosses}


@router.get("/boss-decks/{name}")
def get_boss_deck(name: str):
    ensure_dirs()
    if name == "default":
        if os.path.isfile(DEFAULT_BOSS_PATH):
          return load_json(DEFAULT_BOSS_PATH)
        return {"bosses": []}
    path = os.path.join(CUSTOM_BOSS_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Boss deck not found")
    return load_json(path)


@router.post("/boss-decks/{name}")
def save_boss_deck(name: str, deck: Dict[str, Any]):
    ensure_dirs()
    if name == "default":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default deck is read-only")
    path = os.path.join(CUSTOM_BOSS_DIR, f"{name}.json")
    save_json(path, deck)
    return {"status": "ok", "name": name}


@router.get("/active-boss-deck")
def get_active_boss_deck():
    ensure_dirs()
    return {"name": _content_state().get("active_boss_deck", "default")}


@router.post("/active-boss-deck")
def set_active_boss_deck(payload: Dict[str, Any]):
    ensure_dirs()
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name required")
    if name == "default":
        _content_state()["active_boss_deck"] = "default"
        return {"status": "ok", "name": name}
    path = os.path.join(CUSTOM_BOSS_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Boss deck not found")
    _content_state()["active_boss_deck"] = name
    return {"status": "ok", "name": name}


@router.get("/threat-images")
def list_threat_images():
    ensure_dirs()
    images = []
    for folder in THREAT_IMAGE_DIRS + [CUSTOM_IMAGE_DIR]:
        if not os.path.isdir(folder):
            continue
        for fname in os.listdir(folder):
            if fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                images.append({"name": fname, "path": fname, "custom": folder == CUSTOM_IMAGE_DIR})
    return {"images": images}


@router.post("/threat-images/upload")
async def upload_threat_image(file: UploadFile = File(...)):
    ensure_dirs()
    fname = os.path.basename(file.filename)
    if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")
    dest = os.path.join(CUSTOM_IMAGE_DIR, fname)
    content = await file.read()
    with open(dest, "wb") as out:
        out.write(content)
    return {"status": "ok", "name": fname}


@router.delete("/threat-images/{filename}")
def delete_threat_image(filename: str):
    ensure_dirs()
    target = os.path.join(CUSTOM_IMAGE_DIR, filename)
    if os.path.isfile(target):
        os.remove(target)
        return {"status": "deleted"}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found or not deletable")


@router.get("/threat-images/file/{filename}")
def get_threat_image_file(filename: str):
    """
    Serve a threat image. Prefers custom uploads, then falls back to bundled images.
    """
    ensure_dirs()
    search_dirs = [CUSTOM_IMAGE_DIR] + THREAT_IMAGE_DIRS
    for folder in search_dirs:
        path = os.path.join(folder, filename)
        if os.path.isfile(path):
            return FileResponse(path)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
