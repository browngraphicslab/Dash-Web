import "fs";
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { DocServer } from "../../DocServer";
import { RouteStore } from "../../../server/RouteStore";
import { action, observable } from "mobx";
import { FieldViewProps, FieldView } from "../../views/nodes/FieldView";
import Measure, { ContentRect } from "react-measure";
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { Docs, DocumentOptions } from "../../documents/Documents";

interface ImageImporterProps {
    addSchema: (imageDocs: Doc[]) => void;
}

export default class ImportBox extends React.Component<FieldViewProps> {
    @observable private top = 0;
    @observable private left = 0;
    private dimensions = 50;

    constructor(props: FieldViewProps) {
        super(props);
        library.add(faArrowUp);
    }

    public static LayoutString() { return FieldView.LayoutString(ImportBox); }

    private selector = React.createRef<HTMLInputElement>();

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
        this.selector.current!.setAttribute("directory", "true");
        this.selector.current!.setAttribute("webkitdirectory", "true");
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
                    </div>
                }
            </Measure>
        );
    }

}