import os
import docx2txt
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
import re
import shutil
import uuid
import json
import base64
from shutil import copyfile
from PIL import Image

files_path = "../../server/public/files"
source_path = "./source"
temp_images_path = "./extracted_images"
server_images_path = f"{files_path}/images/buxton"
json_path = "./json"


# noinspection PyProtectedMember
def extract_links(file):
    links = []
    doc = Document(file)
    rels = doc.part.rels
    for rel in rels:
        item = rels[rel]
        if item.reltype == RT.HYPERLINK and ".aspx" not in item._target:
            links.append(item._target)
    return links


def extract_value(kv_string):
    pieces = kv_string.split(":")
    return (pieces[1] if len(pieces) > 1 else kv_string).strip()


def mkdir_if_absent(path):
    try:
        if not os.path.exists(path):
            os.mkdir(path)
    except OSError:
        print("failed to create the appropriate directory structures for %s" % file_name)


def guid():
    return str(uuid.uuid4())


def encode_image(folder: str, name: str):
    with open(f"{temp_images_path}/{folder}/{name}", "rb") as image:
        encoded = base64.b64encode(image.read())
        return encoded.decode("utf-8")


def parse_document(name: str):
    print(f"parsing {name}...")
    pure_name = name.split(".")[0]

    result = {}

    saved_device_images_dir = server_images_path + "/" + pure_name
    temp_device_images_dir = temp_images_path + "/" + pure_name
    mkdir_if_absent(temp_device_images_dir)
    mkdir_if_absent(saved_device_images_dir)

    raw = str(docx2txt.process(source_path +
                               "/" + name, temp_device_images_dir))

    extracted_images = []
    for image in os.listdir(temp_device_images_dir):
        temp = f"{temp_device_images_dir}/{image}"
        native_width, native_height = Image.open(temp).size
        if abs(native_width - native_height) < 10:
            continue
        original = saved_device_images_dir + "/" + image.replace(".", "_o.", 1)
        medium = saved_device_images_dir + "/" + image.replace(".", "_m.", 1)
        copyfile(temp, original)
        copyfile(temp, medium)
        server_path = f"http://localhost:1050/files/images/buxton/{pure_name}/{image}"
        extracted_images.append(server_path)
    result["extracted_images"] = extracted_images

    def sanitize(line): return re.sub("[\n\t]+", "", line).replace(u"\u00A0", " ").replace(
        u"\u2013", "-").replace(u"\u201c", '''"''').replace(u"\u201d", '''"''').strip()

    def sanitize_price(raw_price: str):
        raw_price = raw_price.replace(",", "")
        start = raw_price.find("$")
        if "x" in raw_price.lower():
            return None
        if start > -1:
            i = start + 1
            while i < len(raw_price) and re.match(r"[0-9.]", raw_price[i]):
                i += 1
            price = raw_price[start + 1: i + 1]
            return float(price)
        elif raw_price.lower().find("nfs"):
            return -1
        else:
            return None

    def remove_empty(line): return len(line) > 1

    def try_parse(to_parse: int):
        value: int
        try:
            value = int(to_parse)
        except ValueError:
            value = None
        return value

    lines = list(map(sanitize, raw.split("\n")))
    lines = list(filter(remove_empty, lines))

    result["title"] = lines[2].strip()
    result["short_description"] = lines[3].strip().replace(
        "Short Description: ", "")

    cur = 5
    notes = ""
    while lines[cur] != "Device Details":
        notes += lines[cur] + " "
        cur += 1
    result["buxton_notes"] = notes.strip()

    cur += 1
    clean = list(
        map(lambda data: data.strip().split(":"), lines[cur].split("|")))
    result["company"] = clean[0][len(clean[0]) - 1].strip()

    result["year"] = try_parse(clean[1][len(clean[1]) - 1].strip())
    result["original_price"] = sanitize_price(
        clean[2][len(clean[2]) - 1].strip())

    cur += 1

    result["degrees_of_freedom"] = try_parse(extract_value(
        lines[cur]).replace("NA", "N/A"))
    cur += 1

    dimensions = lines[cur].lower()
    if dimensions.startswith("dimensions"):
        dim_concat = dimensions[11:].strip()
        cur += 1
        while lines[cur] != "Key Words":
            dim_concat += (" " + lines[cur].strip())
            cur += 1
        result["dimensions"] = dim_concat
    else:
        result["dimensions"] = "N/A"

    cur += 1
    result["primary_key"] = extract_value(lines[cur])
    cur += 1
    result["secondary_key"] = extract_value(lines[cur])

    while lines[cur] != "Links":
        result["secondary_key"] += (" " + extract_value(lines[cur]).strip())
        cur += 1

    cur += 1
    link_descriptions = []
    while lines[cur] != "Image":
        description = lines[cur].strip().lower()
        valid = True
        for ignored in ["powerpoint", "vimeo", "xxx"]:
            if ignored in description:
                valid = False
                break
        if valid:
            link_descriptions.append(description)
        cur += 1
    result["link_descriptions"] = link_descriptions

    result["hyperlinks"] = extract_links(source_path + "/" + name)

    images = []
    captions = []
    cur += 3
    while cur + 1 < len(lines) and lines[cur] != "NOTES:":
        name = lines[cur]
        if "full document" not in name.lower():
            images.append(name)
            captions.append(lines[cur + 1])
        cur += 2
    result["table_image_names"] = images

    result["captions"] = captions

    notes = []
    if cur < len(lines) and lines[cur] == "NOTES:":
        cur += 1
        while cur < len(lines):
            notes.append(lines[cur])
            cur += 1
    if len(notes) > 0:
        result["notes"] = notes

    return result


if os.path.exists(server_images_path):
    shutil.rmtree(server_images_path)
while os.path.exists(server_images_path):
    pass
os.mkdir(server_images_path)

mkdir_if_absent(source_path)
mkdir_if_absent(json_path)
mkdir_if_absent(temp_images_path)

results = []

candidates = 0
for file_name in os.listdir(source_path):
    if file_name.endswith('.docx') or file_name.endswith(".doc"):
        candidates += 1
        results.append(parse_document(file_name))


with open(f"./json/buxton_collection.json", "w", encoding="utf-8") as out:
    json.dump(results, out, ensure_ascii=False, indent=4)

print(f"\nSuccessfully parsed {candidates} candidates.")

print("\nrewriting .gitignore...")
entries = ['*', '!.gitignore']
with open(files_path + "/.gitignore", 'w') as f:
    f.write('\n'.join(entries))

shutil.rmtree(temp_images_path)
