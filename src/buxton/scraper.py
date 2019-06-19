import os
import docx2txt
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
import re
from pymongo import MongoClient
import shutil
import uuid

source = "./source"
dist = "./Dash-Web/src/server/public/files"

collection_handle = MongoClient("localhost", 27017)["Dash"]["buxton"]

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
    return kv_string.split(":")[1].strip()

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

    sanitize = lambda line: re.sub("[\n\t]+", "", line).strip().replace(u"\u00A0", " ").replace(u"\u2013", "-").replace(u"\u201c", '''"''').replace(u"\u201d", '''"''')
    remove_empty = lambda line: len(line) > 1

    lines = list(map(sanitize, raw.split("\n")))
    lines = list(filter(remove_empty, lines))

    result["file_name"] = file_name
    result["title"] = lines[2]
    result["short_description"] = lines[3].replace("Short Description: ", "")

    cur = 5
    notes = ""
    while lines[cur] != "Device Details":
        notes += lines[cur] + " "
        cur += 1
    result["buxton_notes"] = notes.strip()
    
    cur += 1
    clean = list(map(lambda data: data.strip().split(":"), lines[cur].split("|")))
    result["company"] = clean[0][1].strip()
    result["year"] = clean[1][1].strip()
    result["original_price"] = clean[2][1].strip()

    cur += 1
    result["degrees_of_freedom"] = extract_value(lines[cur])
    cur += 1
    result["dimensions"] = extract_value(lines[cur])

    cur += 2
    result["primary_key"] = extract_value(lines[cur])
    cur += 1
    result["secondary_key"] = extract_value(lines[cur])

    result["hyperlinks"] = extract_links(source + "/" + file_name)

    cur += 2
    link_descriptions = []
    while lines[cur] != "Image":
        link_descriptions.append(lines[cur])
        cur += 1
    result["link_descriptions"] = link_descriptions

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
while (os.path.exists(dist)):
    pass
os.mkdir(dist)

for file_name in os.listdir(source):
    if file_name.endswith('.docx'):
        upload(parse_document(file_name))

lines = ['*', '!.gitignore']
with open(dist + "/.gitignore", 'w') as f:
    f.write('\n'.join(lines))



