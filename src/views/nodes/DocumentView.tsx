import { observer } from "mobx-react";
import { DocumentController } from "../../controllers/DocumentController";
import React = require("react");
import { computed } from "mobx";
import { KeyStore } from "../../controllers/KeyController";
import { NumberController } from "../../controllers/NumberController";
import { TextController } from "../../controllers/TextController";

interface IProps {
    doc:DocumentController;
}

@observer
export class DocumentView extends React.Component<IProps> {
    @computed
    get x(): number {
        let field = this.props.doc.GetFieldT(KeyStore.X, NumberController);
        return field ? field.Data : 0;
    }

    @computed
    get y(): number {
        let field = this.props.doc.GetFieldT(KeyStore.Y, NumberController);
        return field ? field.Data : 0;
    }

    @computed
    get transform(): string {
        return `translate(${this.x}px, ${this.y}px)`;
    }

    @computed
    get width(): number {
        let field = this.props.doc.GetFieldT(KeyStore.Width, NumberController);
        return field ? field.Data : 0;
    }

    @computed
    get height(): number {
        let field = this.props.doc.GetFieldT(KeyStore.Height, NumberController);
        return field ? field.Data : 0;
    }

    //Temp
    @computed
    get data(): string {
        let field = this.props.doc.GetFieldT(KeyStore.Data, TextController);
        return field ? field.Data : "";
    }

    render() {
        return (
            <div className="node" style={{
                transform: this.transform,
                width: this.width,
                height: this.height
            }}>
                <p>{this.data}</p>
            </div>
        );
    }

}