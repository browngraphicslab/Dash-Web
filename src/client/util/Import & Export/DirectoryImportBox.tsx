import "fs";
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { DocServer } from "../../DocServer";
import { RouteStore } from "../../../server/RouteStore";
import { action, observable, runInAction } from "mobx";
import { FieldViewProps, FieldView } from "../../views/nodes/FieldView";
import Measure, { ContentRect } from "react-measure";
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faTag, faFileExcel } from '@fortawesome/free-solid-svg-icons';
import { Docs, DocumentOptions } from "../../documents/Documents";
import { EditableView } from "../../views/EditableView";

export default class DirectoryImportBox extends React.Component<FieldViewProps> {
    private selector = React.createRef<HTMLInputElement>();
    @observable private top = 0;
    @observable private left = 0;
    private dimensions = 50;

    @observable private key = "Key";
    @observable private value = "Value";

    public static LayoutString() { return FieldView.LayoutString(DirectoryImportBox); }

    constructor(props: FieldViewProps) {
        super(props);
        library.add(faArrowUp, faTag);
    }

    updateKey = (newKey: string) => {
        runInAction(() => this.key = newKey);
        console.log("KEY ", this.key);
        return true;
    }

    updateValue = (newValue: string) => {
        runInAction(() => this.value = newValue);
        console.log("VALUE ", this.value);
        return true;
    }

    handleSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
        let promises: Promise<void>[] = [];
        let docs: Doc[] = [];

        let files = e.target.files;
        if (!files || files.length === 0) return;

        let directory = (files.item(0) as any).webkitRelativePath.split("/", 1);

        for (let i = 0; i < files.length; i++) {
            let uploaded_file = files.item(i);

            if (!uploaded_file) {
                continue;
            }

            let formData = new FormData();
            formData.append('file', uploaded_file);
            let dropFileName = uploaded_file ? uploaded_file.name : "-empty-";
            let type = uploaded_file.type;

            let prom = fetch(DocServer.prepend(RouteStore.upload), {
                method: 'POST',
                body: formData
            }).then(async (res: Response) => {
                (await res.json()).map(action((file: any) => {
                    let path = DocServer.prepend(file);
                    console.log(path);
                    let docPromise = Docs.getDocumentFromType(type, path, { nativeWidth: 300, width: 300, title: dropFileName });
                    docPromise.then(doc => doc && docs.push(doc));
                }));
            });
            promises.push(prom);
        }

        await Promise.all(promises);

        let doc = this.props.Document;
        let options: DocumentOptions = { title: `Import of ${directory}`, width: 500, height: 500, x: Doc.GetT(doc, "x", "number"), y: Doc.GetT(doc, "y", "number") };
        let parent = this.props.ContainingCollectionView;
        if (parent) {
            let importContainer = Docs.StackingDocument(docs, options);
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

    render() {
        let dimensions = 50;
        let keyValueStyle = { paddingLeft: 5, width: "50%" };
        return (
            <Measure offset onResize={this.preserveCentering}>
                {({ measureRef }) =>
                    <div ref={measureRef} style={{ width: "100%", height: "100%", pointerEvents: "all" }} >
                        <input
                            id={"selector"}
                            ref={this.selector}
                            name={"selector"}
                            onChange={this.handleSelection}
                            type="file"
                            style={{
                                position: "absolute",
                                display: "none"
                            }} />
                        <label htmlFor={"selector"}>
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
                                left: this.left + 12.5,
                                top: this.top + 11
                            }}>
                                <FontAwesomeIcon icon={faArrowUp} color="#FFFFFF" size={"2x"} />
                            </div>
                        </label>
                        <div style={{
                            position: "absolute",
                            top: 5,
                            right: 5,
                            borderRadius: "50%",
                            width: 25,
                            height: 25,
                            background: "black"
                        }} />
                        <div style={{
                            position: "absolute",
                            right: 9.5,
                            top: 11
                        }}>
                            <FontAwesomeIcon icon={faTag} color="#FFFFFF" size={"1x"} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "row", borderBottom: "1px solid black", paddingBottom: 5 }} >
                            <div className={"key_container"} style={keyValueStyle}>
                                <EditableView
                                    contents={this.key}
                                    SetValue={this.updateKey}
                                    GetValue={() => this.key}
                                    oneLine={true}
                                />
                            </div>
                            <div className={"value_container"} style={keyValueStyle}>
                                <EditableView
                                    contents={this.value}
                                    SetValue={this.updateValue}
                                    GetValue={() => this.value}
                                    oneLine={true}
                                />
                            </div>
                        </div>
                    </div>
                }
            </Measure>
        );
    }

}