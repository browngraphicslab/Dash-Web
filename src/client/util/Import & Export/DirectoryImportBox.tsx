import "fs";
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { DocServer } from "../../DocServer";
import { RouteStore } from "../../../server/RouteStore";
import { action, observable, autorun, runInAction } from "mobx";
import { FieldViewProps, FieldView } from "../../views/nodes/FieldView";
import Measure, { ContentRect } from "react-measure";
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faTag, faPlus } from '@fortawesome/free-solid-svg-icons';
import { Docs, DocumentOptions } from "../../documents/Documents";
import { observer } from "mobx-react";
import KeyValue from "./KeyValue";
import { Utils } from "../../../Utils";
import { doesNotReject } from "assert";
import { remove } from "typescript-collections/dist/lib/arrays";

@observer
export default class DirectoryImportBox extends React.Component<FieldViewProps> {
    private selector = React.createRef<HTMLInputElement>();
    @observable private top = 0;
    @observable private left = 0;
    private dimensions = 50;

    @observable private editingMetadata = false;
    @observable private metadata_guids: string[] = [];
    @observable private entries: KeyValue[] = [];

    @observable private quota = 1;
    @observable private remaining = 1;

    @observable private uploadBegun = false;

    public static LayoutString() { return FieldView.LayoutString(DirectoryImportBox); }

    constructor(props: FieldViewProps) {
        super(props);
        library.add(faArrowUp, faTag, faPlus);
    }

    @action
    handleSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
        this.uploadBegun = true;

        let promises: Promise<void>[] = [];
        let docs: Doc[] = [];

        let files = e.target.files;
        if (!files || files.length === 0) return;

        let directory = (files.item(0) as any).webkitRelativePath.split("/", 1);

        let validated: File[] = [];
        for (let i = 0; i < files.length; i++) {
            let file = files.item(i);
            file && validated.push(file);
        }

        this.quota = validated.length;

        for (let uploaded_file of validated) {
            if (!uploaded_file) {
                continue;
            }

            let formData = new FormData();
            formData.append('file', uploaded_file);
            let dropFileName = uploaded_file ? uploaded_file.name : "-empty-";
            let type = uploaded_file.type;

            this.remaining++;

            let prom = fetch(DocServer.prepend(RouteStore.upload), {
                method: 'POST',
                body: formData
            }).then(async (res: Response) => {
                (await res.json()).map(action((file: any) => {
                    let path = DocServer.prepend(file);
                    let docPromise = Docs.getDocumentFromType(type, path, { nativeWidth: 300, width: 300, title: dropFileName });
                    docPromise.then(doc => {
                        doc && docs.push(doc) && runInAction(() => this.remaining--);
                    });
                }));
            });
            promises.push(prom);
        }

        await Promise.all(promises);

        docs.forEach(doc => this.entries.forEach(entry => doc[entry.key] = entry.value));

        let doc = this.props.Document;
        let options: DocumentOptions = { title: `Import of ${directory}`, width: 500, height: 500, x: Doc.GetT(doc, "x", "number"), y: Doc.GetT(doc, "y", "number") };
        let parent = this.props.ContainingCollectionView;
        if (parent) {
            let importContainer = Docs.StackingDocument(docs, options);
            importContainer.singleColumn = false;
            Doc.AddDocToList(Doc.GetProto(parent.props.Document), "data", importContainer);
            this.props.removeDocument && this.props.removeDocument(doc);
        }
    }

    componentDidMount() {
        this.selector.current!.setAttribute("directory", "");
        this.selector.current!.setAttribute("webkitdirectory", "");
    }

    @action
    preserveCentering = (rect: ContentRect) => {
        let bounds = rect.offset!;
        if (bounds.width === 0 || bounds.height === 0) {
            return;
        }
        let offset = this.dimensions / 2;
        this.left = bounds.width / 2 - offset;
        this.top = bounds.height / 2 - offset;
    }

    @action
    addMetadataEntry = () => {
        this.metadata_guids.push(Utils.GenerateGuid());
    }

    @action
    remove = (entry: KeyValue) => {
        let index = this.entries.indexOf(entry);
        let key = entry.key;
        this.entries.splice(index, 1);
        this.metadata_guids.splice(this.metadata_guids.indexOf(key), 1);
    }

    render() {
        let dimensions = 50;
        let guids = this.metadata_guids.map(el => el);
        let isEditing = this.editingMetadata;
        let remaining = this.remaining;
        let quota = this.quota;
        let percent = `${100 - (remaining / quota * 100)}`;
        let uploadBegun = this.uploadBegun;
        percent = percent.split(".")[0];
        percent = percent.startsWith("100") ? "99" : percent;
        return (
            <Measure offset onResize={this.preserveCentering}>
                {({ measureRef }) =>
                    <div ref={measureRef} style={{ width: "100%", height: "100%", pointerEvents: "all" }} >
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
                                left: this.left + 12.6,
                                top: this.top + 11,
                                opacity: uploadBegun ? 0 : 1,
                                transition: "0.4s opacity ease"
                            }}>
                                <FontAwesomeIcon icon={faArrowUp} color="#FFFFFF" size={"2x"} />
                            </div>
                        </label>
                        <div
                            style={{
                                transition: "0.4s opacity ease",
                                opacity: uploadBegun ? 1 : 0,
                                pointerEvents: "none",
                                position: "absolute",
                                left: 10,
                                top: this.top + 12.3,
                                fontSize: 18,
                                color: "white",
                                marginLeft: this.left - 1.6
                            }}>{percent}%</div>
                        <div
                            style={{
                                position: "absolute",
                                top: 10,
                                right: 10,
                                borderRadius: "50%",
                                width: 25,
                                height: 25,
                                background: "black"
                            }}
                            onClick={action(() => this.editingMetadata = !this.editingMetadata)}
                        />
                        <FontAwesomeIcon
                            style={{
                                pointerEvents: "none",
                                position: "absolute",
                                right: isEditing ? 16.3 : 14.5,
                                top: isEditing ? 15.4 : 16
                            }}
                            icon={isEditing ? faArrowUp : faTag}
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
                            {guids.map(guid => <KeyValue remove={this.remove} key={guid} ref={(el) => { if (el) this.entries.push(el); }} />)}
                        </div>
                        {/* <img style={{ width: 30, height: 30 }} src={"./loading.gif"}></img> */}
                    </div>
                }
            </Measure>
        );
    }

}