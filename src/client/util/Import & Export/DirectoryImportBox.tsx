import "fs";
import React = require("react");
import { Doc, DocListCast, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { action, observable, runInAction, computed, reaction, IReactionDisposer } from "mobx";
import { FieldViewProps, FieldView } from "../../views/nodes/FieldView";
import Measure, { ContentRect } from "react-measure";
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTag, faPlus, faCloudUploadAlt } from '@fortawesome/free-solid-svg-icons';
import { Docs, DocumentOptions } from "../../documents/Documents";
import { observer } from "mobx-react";
import ImportMetadataEntry, { keyPlaceholder, valuePlaceholder } from "./ImportMetadataEntry";
import { Utils } from "../../../Utils";
import { DocumentManager } from "../DocumentManager";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { Cast, BoolCast, NumCast } from "../../../new_fields/Types";
import { listSpec } from "../../../new_fields/Schema";
import { GooglePhotos } from "../../apis/google_docs/GooglePhotosClientUtils";
import { SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import "./DirectoryImportBox.scss";
import { Networking } from "../../Network";
import { BatchedArray } from "array-batcher";
import * as path from 'path';
import { AcceptibleMedia, Upload } from "../../../server/SharedMediaTypes";

const unsupported = ["text/html", "text/plain"];

@observer
export default class DirectoryImportBox extends React.Component<FieldViewProps> {
    private selector = React.createRef<HTMLInputElement>();
    @observable private top = 0;
    @observable private left = 0;
    private dimensions = 50;
    @observable private phase = "";
    private disposer: Opt<IReactionDisposer>;

    @observable private entries: ImportMetadataEntry[] = [];

    @observable private quota = 1;
    @observable private completed = 0;

    @observable private uploading = false;
    @observable private removeHover = false;

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DirectoryImportBox, fieldKey); }

    constructor(props: FieldViewProps) {
        super(props);
        library.add(faTag, faPlus);
        const doc = this.props.Document;
        this.editingMetadata = this.editingMetadata || false;
        this.persistent = this.persistent || false;
        !Cast(doc.data, listSpec(Doc)) && (doc.data = new List<Doc>());
    }

    @computed
    private get editingMetadata() {
        return BoolCast(this.props.Document.editingMetadata);
    }

    private set editingMetadata(value: boolean) {
        this.props.Document.editingMetadata = value;
    }

    @computed
    private get persistent() {
        return BoolCast(this.props.Document.persistent);
    }

    private set persistent(value: boolean) {
        this.props.Document.persistent = value;
    }

    handleSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
        runInAction(() => {
            this.uploading = true;
            this.phase = "Initializing download...";
        });

        const docs: Doc[] = [];

        const files = e.target.files;
        if (!files || files.length === 0) return;

        const directory = (files.item(0) as any).webkitRelativePath.split("/", 1)[0];

        const validated: File[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files.item(i);
            if (file && !unsupported.includes(file.type)) {
                const ext = path.extname(file.name).toLowerCase();
                if (AcceptibleMedia.imageFormats.includes(ext)) {
                    validated.push(file);
                }
            }
        }

        runInAction(() => {
            this.quota = validated.length;
            this.completed = 0;
        });

        const sizes: number[] = [];
        const modifiedDates: number[] = [];

        runInAction(() => this.phase = `Internal: uploading ${this.quota - this.completed} files to Dash...`);

        const batched = BatchedArray.from(validated, { batchSize: 15 });
        const uploads = await batched.batchedMapAsync<Upload.FileResponse<Upload.ImageInformation>>(async (batch, collector) => {
            batch.forEach(file => {
                sizes.push(file.size);
                modifiedDates.push(file.lastModified);
            });
            collector.push(...(await Networking.UploadFilesToServer<Upload.ImageInformation>(batch)));
            runInAction(() => this.completed += batch.length);
        });

        await Promise.all(uploads.map(async response => {
            const { source: { type }, result } = response;
            if (result instanceof Error) {
                return;
            }
            const { accessPaths, exifData } = result;
            const path = Utils.prepend(accessPaths.agnostic.client);
            const document = await Docs.Get.DocumentFromType(type, path, { _width: 300, title: name });
            const { data, error } = exifData;
            if (document) {
                Doc.GetProto(document).exif = error || Docs.Get.DocumentHierarchyFromJson(data);
                docs.push(document);
            }
        }));

        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            doc.size = sizes[i];
            doc.modified = modifiedDates[i];
            this.entries.forEach(entry => {
                const target = entry.onDataDoc ? Doc.GetProto(doc) : doc;
                target[entry.key] = entry.value;
            });
        }

        const doc = this.props.Document;
        const height: number = NumCast(doc.height) || 0;
        const offset: number = this.persistent ? (height === 0 ? 0 : height + 30) : 0;
        const options: DocumentOptions = {
            title: `Import of ${directory}`,
            _width: 1105,
            _height: 500,
            x: NumCast(doc.x),
            y: NumCast(doc.y) + offset
        };
        const parent = this.props.ContainingCollectionView;
        if (parent) {
            let importContainer: Doc;
            if (docs.length < 50) {
                importContainer = Docs.Create.MasonryDocument(docs, options);
            } else {
                const headers = [new SchemaHeaderField("title"), new SchemaHeaderField("size")];
                importContainer = Docs.Create.SchemaDocument(headers, docs, options);
            }
            runInAction(() => this.phase = 'External: uploading files to Google Photos...');
            importContainer.singleColumn = false;
            await GooglePhotos.Export.CollectionToAlbum({ collection: importContainer });
            Doc.AddDocToList(Doc.GetProto(parent.props.Document), "data", importContainer);
            !this.persistent && this.props.removeDocument && this.props.removeDocument(doc);
            DocumentManager.Instance.jumpToDocument(importContainer, true);
        }

        runInAction(() => {
            this.uploading = false;
            this.quota = 1;
            this.completed = 0;
        });
    }

    componentDidMount() {
        this.selector.current!.setAttribute("directory", "");
        this.selector.current!.setAttribute("webkitdirectory", "");
        this.disposer = reaction(
            () => this.completed,
            completed => runInAction(() => this.phase = `Internal: uploading ${this.quota - completed} files to Dash...`)
        );
    }

    componentWillUnmount() {
        this.disposer && this.disposer();
    }

    @action
    preserveCentering = (rect: ContentRect) => {
        const bounds = rect.offset!;
        if (bounds.width === 0 || bounds.height === 0) {
            return;
        }
        const offset = this.dimensions / 2;
        this.left = bounds.width / 2 - offset;
        this.top = bounds.height / 2 - offset;
    }

    @action
    addMetadataEntry = async () => {
        const entryDoc = new Doc();
        entryDoc.checked = false;
        entryDoc.key = keyPlaceholder;
        entryDoc.value = valuePlaceholder;
        Doc.AddDocToList(this.props.Document, "data", entryDoc);
    }

    @action
    remove = async (entry: ImportMetadataEntry) => {
        const metadata = await DocListCastAsync(this.props.Document.data);
        if (metadata) {
            let index = this.entries.indexOf(entry);
            if (index !== -1) {
                runInAction(() => this.entries.splice(index, 1));
                index = metadata.indexOf(entry.props.Document);
                if (index !== -1) {
                    metadata.splice(index, 1);
                }
            }
        }
    }

    render() {
        const dimensions = 50;
        const entries = DocListCast(this.props.Document.data);
        const isEditing = this.editingMetadata;
        const completed = this.completed;
        const quota = this.quota;
        const uploading = this.uploading;
        const showRemoveLabel = this.removeHover;
        const persistent = this.persistent;
        let percent = `${completed / quota * 100}`;
        percent = percent.split(".")[0];
        percent = percent.startsWith("100") ? "99" : percent;
        const marginOffset = (percent.length === 1 ? 5 : 0) - 1.6;
        const message = <span className={"phase"}>{this.phase}</span>;
        const centerPiece = this.phase.includes("Google Photos") ?
            <img src={"/assets/google_photos.png"} style={{
                transition: "0.4s opacity ease",
                width: 30,
                height: 30,
                opacity: uploading ? 1 : 0,
                pointerEvents: "none",
                position: "absolute",
                left: 12,
                top: this.top + 10,
                fontSize: 18,
                color: "white",
                marginLeft: this.left + marginOffset
            }} />
            : <div
                style={{
                    transition: "0.4s opacity ease",
                    opacity: uploading ? 1 : 0,
                    pointerEvents: "none",
                    position: "absolute",
                    left: 10,
                    top: this.top + 12.3,
                    fontSize: 18,
                    color: "white",
                    marginLeft: this.left + marginOffset
                }}>{percent}%</div>;
        return (
            <Measure offset onResize={this.preserveCentering}>
                {({ measureRef }) =>
                    <div ref={measureRef} style={{ width: "100%", height: "100%", pointerEvents: "all" }} >
                        {message}
                        <input
                            id={"selector"}
                            ref={this.selector}
                            onChange={this.handleSelection}
                            type="file"
                            style={{
                                position: "absolute",
                                display: "none"
                            }} />
                        <label
                            htmlFor={"selector"}
                            style={{
                                opacity: isEditing ? 0 : 1,
                                pointerEvents: isEditing ? "none" : "all",
                                transition: "0.4s ease opacity"
                            }}
                        >
                            <div style={{
                                width: dimensions,
                                height: dimensions,
                                borderRadius: "50%",
                                background: "black",
                                position: "absolute",
                                left: this.left,
                                top: this.top
                            }} />
                            <div style={{
                                position: "absolute",
                                left: this.left + 8,
                                top: this.top + 10,
                                opacity: uploading ? 0 : 1,
                                transition: "0.4s opacity ease"
                            }}>
                                <FontAwesomeIcon icon={faCloudUploadAlt} color="#FFFFFF" size={"2x"} />
                            </div>
                            <img
                                style={{
                                    width: 80,
                                    height: 80,
                                    transition: "0.4s opacity ease",
                                    opacity: uploading ? 0.7 : 0,
                                    position: "absolute",
                                    top: this.top - 15,
                                    left: this.left - 15
                                }}
                                src={"/assets/loading.gif"}></img>
                        </label>
                        <input
                            type={"checkbox"}
                            onChange={e => runInAction(() => this.persistent = e.target.checked)}
                            style={{
                                margin: 0,
                                position: "absolute",
                                left: 10,
                                bottom: 10,
                                opacity: isEditing || uploading ? 0 : 1,
                                transition: "0.4s opacity ease",
                                pointerEvents: isEditing || uploading ? "none" : "all"
                            }}
                            checked={this.persistent}
                            onPointerEnter={action(() => this.removeHover = true)}
                            onPointerLeave={action(() => this.removeHover = false)}
                        />
                        <p
                            style={{
                                position: "absolute",
                                left: 27,
                                bottom: 8.4,
                                fontSize: 12,
                                opacity: showRemoveLabel ? 1 : 0,
                                transition: "0.4s opacity ease"
                            }}>Template will be <span style={{ textDecoration: "underline", textDecorationColor: persistent ? "green" : "red", color: persistent ? "green" : "red" }}>{persistent ? "kept" : "removed"}</span> after upload</p>
                        {centerPiece}
                        <div
                            style={{
                                position: "absolute",
                                top: 10,
                                right: 10,
                                borderRadius: "50%",
                                width: 25,
                                height: 25,
                                background: "black",
                                pointerEvents: uploading ? "none" : "all",
                                opacity: uploading ? 0 : 1,
                                transition: "0.4s opacity ease"
                            }}
                            title={isEditing ? "Back to Upload" : "Add Metadata"}
                            onClick={action(() => this.editingMetadata = !this.editingMetadata)}
                        />
                        <FontAwesomeIcon
                            style={{
                                pointerEvents: "none",
                                position: "absolute",
                                right: isEditing ? 14 : 15,
                                top: isEditing ? 15.4 : 16,
                                opacity: uploading ? 0 : 1,
                                transition: "0.4s opacity ease"
                            }}
                            icon={isEditing ? faCloudUploadAlt : faTag}
                            color="#FFFFFF"
                            size={"1x"}
                        />
                        <div
                            style={{
                                transition: "0.4s ease opacity",
                                width: "100%",
                                height: "100%",
                                pointerEvents: isEditing ? "all" : "none",
                                opacity: isEditing ? 1 : 0,
                                overflowY: "scroll"
                            }}
                        >
                            <div
                                style={{
                                    borderRadius: "50%",
                                    width: 25,
                                    height: 25,
                                    marginLeft: 10,
                                    position: "absolute",
                                    right: 41,
                                    top: 10
                                }}
                                title={"Add Metadata Entry"}
                                onClick={this.addMetadataEntry}
                            >
                                <FontAwesomeIcon
                                    style={{
                                        pointerEvents: "none",
                                        marginLeft: 6.4,
                                        marginTop: 5.2
                                    }}
                                    icon={faPlus}
                                    size={"1x"}
                                />
                            </div>
                            <p style={{ paddingLeft: 10, paddingTop: 8, paddingBottom: 7 }} >Add metadata to your import...</p>
                            <hr style={{ margin: "6px 10px 12px 10px" }} />
                            {entries.map(doc =>
                                <ImportMetadataEntry
                                    Document={doc}
                                    key={doc[Id]}
                                    remove={this.remove}
                                    ref={(el) => { if (el) this.entries.push(el); }}
                                    next={this.addMetadataEntry}
                                />
                            )}
                        </div>
                    </div>
                }
            </Measure>
        );
    }

}