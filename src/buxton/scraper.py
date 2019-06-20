import os
import docx2txt
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
import re
from pymongo import MongoClient
import shutil
import uuid
import datetime
from PIL import Image
import math
import sys

source = "./source"
dist = "../server/public/files"

db = MongoClient("localhost", 27017)["Dash"]
schema_guids = []


def extract_links(fileName):
    links = []
    doc = Document(fileName)
    rels = doc.part.rels
    for rel in rels:
        item = rels[rel]
        if item.reltype == RT.HYPERLINK and ".aspx" not in item._target:
            links.append(item._target)
    return listify(links)


def extract_value(kv_string):
    pieces = kv_string.split(":")
    return (pieces[1] if len(pieces) > 1 else kv_string).strip()


def mkdir_if_absent(path):
    try:
        if not os.path.exists(path):
            os.mkdir(path)
    except OSError:
        print("Failed to create the appropriate directory structures for %s" % file_name)


def guid():
    return str(uuid.uuid4())


def listify(list):
    return {
        "fields": list,
        "__type": "list"
    }


def protofy(fieldId):
    return {
        "fieldId": fieldId,
        "__type": "proxy"
    }


def write_schema(parse_results, display_fields):
    view_guids = parse_results["child_guids"]

    data_doc = parse_results["schema"]
    fields = data_doc["fields"]

    view_doc_guid = guid()

    view_doc = {
        "_id": view_doc_guid,
        "fields": {
            "proto": protofy(data_doc["_id"]),
            "x": 10,
            "y": 10,
            "width": 900,
            "height": 600,
            "panX": 0,
            "panY": 0,
            "zoomBasis": 0.5,
            "zIndex": 2,
            "libraryBrush": False,
            "viewType": 2
        },
        "__type": "Doc"
    }

    fields["proto"] = protofy("collectionProto")
    fields["data"] = listify(proxify_guids(view_guids))
    fields["schemaColumns"] = listify(display_fields)
    fields["backgroundColor"] = "white"
    fields["scale"] = 0.5
    fields["viewType"] = 2
    fields["author"] = "Bill Buxton"
    fields["creationDate"] = {
        "date": datetime.datetime.utcnow().microsecond,
        "__type": "date"
    }
    fields["isPrototype"] = True
    fields["page"] = -1

    db.newDocuments.insert_one(data_doc)
    db.newDocuments.insert_one(view_doc)

    data_doc_guid = data_doc["_id"]
    print(
        f"Uploaded {view_doc_guid} (view) and {data_doc_guid} (data) to http://localhost:27017...\n")

    return view_doc_guid


def write_image(folder, name):
    path = f"http://localhost:1050/files/{folder}/{name}"

    data_doc_guid = guid()
    view_doc_guid = guid()

    view_doc = {
        "_id": view_doc_guid,
        "fields": {
            "proto": protofy(data_doc_guid),
            "x": 10,
            "y": 10,
            "width": 300,
            "zIndex": 2,
            "libraryBrush": False
        },
        "__type": "Doc"
    }

    image = Image.open(f"{dist}/{folder}/{name}")
    native_width, native_height = image.size

    data_doc = {
        "_id": data_doc_guid,
        "fields": {
            "proto": protofy("imageProto"),
            "data": {
                "url": path,
                "__type": "image"
            },
            "title": name,
            "nativeWidth": native_width,
            "author": "Bill Buxton",
            "creationDate": {
                "date": datetime.datetime.utcnow().microsecond,
                "__type": "date"
            },
            "isPrototype": True,
            "page": -1,
            "nativeHeight": native_height,
            "height": native_height
        },
        "__type": "Doc"
    }

    db.newDocuments.insert_one(view_doc)
    db.newDocuments.insert_one(data_doc)

    return view_doc_guid


def parse_document(file_name: str):
    print(f"Parsing {file_name}...")
    pure_name = file_name.split(".")[0]

    result = {}

    dir_path = dist + "/" + pure_name
    mkdir_if_absent(dir_path)

    raw = str(docx2txt.process(source + "/" + file_name, dir_path))

    print("Extracting images...")
    view_guids = []
    for image in os.listdir(dir_path):
        view_guids.append(write_image(pure_name, image))
        os.rename(dir_path + "/" + image, dir_path +
                  "/" + image.replace(".", "_m.", 1))

    def sanitize(line): return re.sub("[\n\t]+", "", line).replace(u"\u00A0", " ").replace(
        u"\u2013", "-").replace(u"\u201c", '''"''').replace(u"\u201d", '''"''').strip()

    def sanitize_price(raw: str):
        raw = raw.replace(",", "")
        start = raw.find("$")
        if start > -1:
            i = start + 1
            while (i < len(raw) and re.match(r"[0-9\.]", raw[i])):
                i += 1
            price = raw[start + 1: i + 1]
            return float(price)
        elif (raw.lower().find("nfs")):
            return -1
        else:
            return math.nan

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
    result["original_price"] = sanitize_price(
        clean[2][len(clean[2]) - 1].strip())

    cur += 1
    result["degrees_of_freedom"] = extract_value(
        lines[cur]).replace("NA", "N/A")
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
        link_descriptions.append(lines[cur].strip())
        cur += 1
    result["link_descriptions"] = listify(link_descriptions)

    result["hyperlinks"] = extract_links(source + "/" + file_name)

    images = []
    captions = []
    cur += 3
    while cur + 1 < len(lines) and lines[cur] != "NOTES:":
        images.append(lines[cur])
        captions.append(lines[cur + 1])
        cur += 2
    result["images"] = listify(images)
    result["captions"] = listify(captions)

    notes = []
    if (cur < len(lines) and lines[cur] == "NOTES:"):
        cur += 1
        while cur < len(lines):
            notes.append(lines[cur])
            cur += 1
    if len(notes) > 0:
        result["notes"] = listify(notes)

    return {
        "schema": {
            "_id": guid(),
            "fields": result,
            "__type": "Doc"
        },
        "child_guids": view_guids
    }


def proxify_guids(guids):
    return list(map(lambda guid: {"fieldId": guid, "__type": "proxy"}, guids))


if os.path.exists(dist):
    shutil.rmtree(dist)
while os.path.exists(dist):
    pass
os.mkdir(dist)
mkdir_if_absent(source)

candidates = 0
for file_name in os.listdir(source):
    if file_name.endswith('.docx'):
        candidates += 1
        schema_guids.append(write_schema(
            parse_document(file_name), ["title", "data"]))

print("Writing parent schema...")
parent_guid = write_schema({
    "schema": {
        "_id": guid(),
        "fields": {},
        "__type": "Doc"
    },
    "child_guids": schema_guids
}, ["title", "short_description", "original_price"])

print("Appending parent schema to main workspace...\n")
db.newDocuments.update_one(
    {"fields.title": "WS collection 1"},
    {"$push": {"fields.data.fields": {"fieldId": parent_guid, "__type": "proxy"}}}
)

print("Rewriting .gitignore...\n")
lines = ['*', '!.gitignore']
with open(dist + "/.gitignore", 'w') as f:
    f.write('\n'.join(lines))

suffix = "" if candidates == 1 else "s"
print(f"Done. {candidates} candidate{suffix} processed.")
