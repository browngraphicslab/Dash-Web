import { observer } from "mobx-react";
import * as React from "react";
import { DocumentView } from "./DocumentView";
import { DocumentManager } from "../../util/DocumentManager";
import { Transformer, Scripting, ts } from "../../util/Scripting";
import { Field } from "../../../fields/Doc";

@observer
export class DocumentIcon extends React.Component<{ view: DocumentView, index: number }> {
    render() {
        const view = this.props.view;
        const transform = view.props.ScreenToLocalTransform().scale(view.LocalScaling).inverse();
        const { x, y, width, height } = transform.transformBounds(0, 0, view.props.PanelWidth(), view.props.PanelHeight());

        return (
            <div className="documentIcon-outerDiv" style={{
                position: "absolute",
                transform: `translate(${x + width / 2}px, ${y}px)`,
            }}>
                <p>d{this.props.index}</p>
            </div>
        );
    }
}

@observer
export class DocumentIconContainer extends React.Component {
    public static getTransformer(): Transformer {
        const usedDocuments = new Set<number>();
        return {
            transformer: context => {
                return root => {
                    function visit(node: ts.Node) {
                        node = ts.visitEachChild(node, visit, context);

                        if (ts.isIdentifier(node)) {
                            const isntPropAccess = !ts.isPropertyAccessExpression(node.parent) || node.parent.expression === node;
                            const isntPropAssign = !ts.isPropertyAssignment(node.parent) || node.parent.name !== node;
                            const isntParameter = !ts.isParameter(node.parent);
                            if (isntPropAccess && isntPropAssign && isntParameter && !(node.text in globalThis)) {
                                const match = node.text.match(/d([0-9]+)/);
                                if (match) {
                                    const m = parseInt(match[1]);
                                    usedDocuments.add(m);
                                }
                            }
                        }

                        return node;
                    }
                    return ts.visitNode(root, visit);
                };
            },
            getVars() {
                const docs = DocumentManager.Instance.DocumentViews;
                const capturedVariables: { [name: string]: Field } = {};
                usedDocuments.forEach(index => capturedVariables[`d${index}`] = docs[index].props.Document);
                return { capturedVariables };
            }
        };
    }
    render() {
        return DocumentManager.Instance.DocumentViews.map((dv, i) => <DocumentIcon key={i} index={i} view={dv} />);
    }
}