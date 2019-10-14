import os
from shutil import copyfile
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
dist = "../../server/public/files"

db = MongoClient("localhost", 27017)["Dash"]
target_collection = db.newDocuments
target_doc_title = "Workspace 1"
schema_guids = []
common_proto_id = ""


def extract_links(fileName):
    links = []
    doc = Document(fileName)
    rels = doc.part.rels
    for rel in rels:
        item = rels[rel]
        if item.reltype == RT.HYPERLINK and ".aspx" not in item._target:
            links.append(item._target)
    return text_doc_map(links)


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


def text_doc_map(string_list):
    def guid_map(caption):
        return write_text_doc(caption)
    return listify(proxify_guids(list(map(guid_map, string_list))))


def write_collection(parse_results, display_fields, storage_key, viewType=2):
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
            "zIndex": 2,
            "libraryBrush": False,
            "viewType": viewType
        },
        "__type": "Doc"
    }

    fields["proto"] = protofy(common_proto_id)
    fields[storage_key] = listify(proxify_guids(view_guids))
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

    target_collection.insert_one(data_doc)
    target_collection.insert_one(view_doc)

    data_doc_guid = data_doc["_id"]
    print(f"inserted view document ({view_doc_guid})")
    print(f"inserted data document ({data_doc_guid})\n")

    return view_doc_guid


def write_text_doc(content):
    data_doc_guid = guid()
    view_doc_guid = guid()

    view_doc = {
        "_id": view_doc_guid,
        "fields": {
            "proto": protofy(data_doc_guid),
            "x": 10,
            "y": 10,
            "width": 400,
            "zIndex": 2
        },
        "__type": "Doc"
    }

    data_doc = {
        "_id": data_doc_guid,
        "fields": {
            "proto": protofy("textProto"),
            "data": {
                "Data": '{"doc":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"' + content + '"}]}]},"selection":{"type":"text","anchor":1,"head":1}' + '}',
                "__type": "RichTextField"
            },
            "title": content,
            "nativeWidth": 200,
            "author": "Bill Buxton",
            "creationDate": {
                "date": datetime.datetime.utcnow().microsecond,
                "__type": "date"
            },
            "isPrototype": True,
            "autoHeight": True,
            "page": -1,
            "nativeHeight": 200,
            "height": 200,
            "data_text": content
        },
        "__type": "Doc"
    }

    target_collection.insert_one(view_doc)
    target_collection.insert_one(data_doc)

    return view_doc_guid


def write_image(folder, name):
    path = f"http://localhost:1050/files/{folder}/{name}"

    data_doc_guid = guid()
    view_doc_guid = guid()

    image = Image.open(f"{dist}/{folder}/{name}")
    native_width, native_height = image.size

    view_doc = {
        "_id": view_doc_guid,
        "fields": {
            "proto": protofy(data_doc_guid),
            "x": 10,
            "y": 10,
            "width": min(800, native_width),
            "zIndex": 2
        },
        "__type": "Doc"
    }

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

    target_collection.insert_one(view_doc)
    target_collection.insert_one(data_doc)

    return view_doc_guid


def parse_document(file_name: str):
    print(f"parsing {file_name}...")
    pure_name = file_name.split(".")[0]

    result = {}

    dir_path = dist + "/" + pure_name
    mkdir_if_absent(dir_path)

    raw = str(docx2txt.process(source + "/" + file_name, dir_path))

    view_guids = []
    count = 0
    for image in os.listdir(dir_path):
        count += 1
        view_guids.append(write_image(pure_name, image))
        copyfile(dir_path + "/" + image, dir_path +
                 "/" + image.replace(".", "_o.", 1))
        copyfile(dir_path + "/" + image, dir_path +
                 "/" + image.replace(".", "_m.", 1))
    print(f"extracted {count} images...")

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
    result["link_descriptions"] = text_doc_map(link_descriptions)

    result["hyperlinks"] = extract_links(source + "/" + file_name)

    images = []
    captions = []
    cur += 3
    while cur + 1 < len(lines) and lines[cur] != "NOTES:":
        images.append(lines[cur])
        captions.append(lines[cur + 1])
        cur += 2
    result["images"] = listify(images)

    result["captions"] = text_doc_map(captions)

    notes = []
    if (cur < len(lines) and lines[cur] == "NOTES:"):
        cur += 1
        while cur < len(lines):
            notes.append(lines[cur])
            cur += 1
    if len(notes) > 0:
        result["notes"] = listify(notes)

    print("writing child schema...")

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


def write_common_proto():
    id = guid()
    common_proto = {
        "_id": id,
        "fields": {
            "proto": protofy("collectionProto"),
            "title": "Common Import Proto",
        },
        "__type": "Doc"
    }

    target_collection.insert_one(common_proto)

    return id


if os.path.exists(dist):
    shutil.rmtree(dist)
while os.path.exists(dist):
    pass
os.mkdir(dist)
mkdir_if_absent(source)

common_proto_id = write_common_proto()

candidates = 0
for file_name in os.listdir(source):
    if file_name.endswith('.docx'):
        candidates += 1
        schema_guids.append(write_collection(
            parse_document(file_name), ["title", "data"], "image_data"))

print("writing parent schema...")
parent_guid = write_collection({
    "schema": {
        "_id": guid(),
        "fields": {},
        "__type": "Doc"
    },
    "child_guids": schema_guids
}, ["title", "short_description", "original_price"], "data", 1)

print("appending parent schema to main workspace...\n")
target_collection.update_one(
    {"fields.title": target_doc_title},
    {"$push": {"fields.data.fields": {"fieldId": parent_guid, "__type": "proxy"}}}
)

print("rewriting .gitignore...\n")
lines = ['*', '!.gitignore']
with open(dist + "/.gitignore", 'w') as f:
    f.write('\n'.join(lines))

suffix = "" if candidates == 1 else "s"
print(f"conversion complete. {candidates} candidate{suffix} processed.")
