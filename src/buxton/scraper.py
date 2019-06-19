import os
import docx2txt
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
import re
from pymongo import MongoClient
import shutil
import uuid

source = "./source"
dist = "../server/public/files"

db = MongoClient("localhost", 27017)["Dash"]
db.buxton.drop()
collection_handle = db.buxton


def extract_links(fileName):
    links = []
    doc = Document(fileName)
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
        print("Failed to create the appropriate directory structures for %s" % file_name)


def parse_document(file_name: str):
    result = {}
    pure_name = file_name.split(".")[0]

    dir_path = dist + "/" + pure_name
    mkdir_if_absent(dir_path)

    raw = str(docx2txt.process(source + "/" + file_name, dir_path))

    def sanitize(line): return re.sub("[\n\t]+", "", line).replace(u"\u00A0", " ").replace(
        u"\u2013", "-").replace(u"\u201c", '''"''').replace(u"\u201d", '''"''').strip()

    def remove_empty(line): return len(line) > 1

    lines = list(map(sanitize, raw.split("\n")))
    lines = list(filter(remove_empty, lines))

    result["file_name"] = file_name
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
    result["year"] = clean[1][len(clean[1]) - 1].strip()
    result["original_price"] = clean[2][len(clean[2]) - 1].strip()

    cur += 1
    result["degrees_of_freedom"] = extract_value(lines[cur])
    cur += 1

    dimensions = lines[cur].lower()
    if dimensions.startswith("dimensions"):
        result["dimensions"] = dimensions[11:].strip()
        cur += 1
        while lines[cur] != "Key Words":
            result["dimensions"] += (" " + lines[cur].strip())
            cur += 1

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
        link_descriptions.append(lines[cur].strip())
        cur += 1
    result["link_descriptions"] = link_descriptions

    result["hyperlinks"] = extract_links(source + "/" + file_name)

    images = []
    captions = []
    cur += 3
    while cur + 1 < len(lines) and lines[cur] != "NOTES:":
        images.append(lines[cur])
        captions.append(lines[cur + 1])
        cur += 2
    result["images"] = images
    result["captions"] = captions

    notes = []
    if (cur < len(lines) and lines[cur] == "NOTES:"):
        cur += 1
        while cur < len(lines):
            notes.append(lines[cur])
            cur += 1
    if len(notes) > 0:
        result["notes"] = notes

    return result


def upload(document):
    wrapper = {}
    wrapper["_id"] = str(uuid.uuid4())
    wrapper["fields"] = document
    wrapper["__type"] = "Doc"
    collection_handle.insert_one(wrapper)


if os.path.exists(dist):
    shutil.rmtree(dist)
while os.path.exists(dist):
    pass
os.mkdir(dist)
mkdir_if_absent(source)

for file_name in os.listdir(source):
    if file_name.endswith('.docx'):
        upload(parse_document(file_name))

lines = ['*', '!.gitignore']
with open(dist + "/.gitignore", 'w') as f:
    f.write('\n'.join(lines))
