import "fs";
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { DocServer } from "../../DocServer";
import { RouteStore } from "../../../server/RouteStore";
import { action } from "mobx";
import { Docs } from "../../documents/Documents";
import { FieldViewProps } from "../../views/nodes/FieldView";

interface ImageImporterProps {
    addSchema: (imageDocs: Doc[]) => void;
}

export default class BulkImporter extends React.Component<FieldViewProps> {
    private selector = React.createRef<HTMLInputElement>();

    handleSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
        let promises: Promise<void>[] = [];
        let docs: Doc[] = [];

        let files = e.target.files;
        if (!files) return;

        for (let i = 0; i < files.length; i++) {
            let target = files.item(i);

            if (target === null) {
                continue;
            }

            let type = target.type;
            let formData = new FormData();
            formData.append('file', target);
            let dropFileName = target ? target.name : "-empty-";

            let prom = fetch(DocServer.prepend(RouteStore.upload), {
                method: 'POST',
                body: formData
            }).then(async (res: Response) => {
                (await res.json()).map(action((file: any) => {
                    let path = window.location.origin + file;
                    let docPromise = Docs.getDocumentFromType(type, path, { nativeWidth: 300, width: 300, title: dropFileName });
                    docPromise.then(doc => doc && docs.push(doc));
                }));
            });
            promises.push(prom);
        }

        await Promise.all(promises);

        let parent = Docs.SchemaDocument(["title", "data"], docs, { width: 300, height: 300, title: "Bulk Import from Directory" });
    }

    componentDidMount() {
        this.selector.current!.setAttribute("directory", "true");
        this.selector.current!.setAttribute("webkitdirectory", "true");
    }

    render() {
        return (
            <div>
                <input ref={this.selector} name={"selector"} onChange={this.handleSelection} type="file" style={{ position: "absolute" }} />
            </div>
        );
    }

}