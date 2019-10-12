import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit } from '@fortawesome/free-regular-svg-icons';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc } from '../../../new_fields/Doc';
import { createSchema, makeInterface, listSpec } from '../../../new_fields/Schema';
import { ScriptField } from '../../../new_fields/ScriptField';
import { emptyFunction } from '../../../Utils';
import { CompileScript } from '../../util/Scripting';
import { ContextMenu } from '../ContextMenu';
import { DocComponent } from '../DocComponent';
import { OverlayView } from '../OverlayView';
import { ScriptBox } from '../ScriptBox';
import { DocumentIconContainer } from './DocumentIcon';
import './DragBox.scss';
import { FieldView, FieldViewProps } from './FieldView';
import { DragManager } from '../../util/DragManager';
import { Docs } from '../../documents/Documents';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Cast } from '../../../new_fields/Types';
import { ContextMenuProps } from '../ContextMenuItem';

library.add(faEdit as any);

const DragSchema = createSchema({
    onDragStart: ScriptField,
    text: "string"
});

type DragDocument = makeInterface<[typeof DragSchema]>;
const DragDocument = makeInterface(DragSchema);
@observer
export class DragBox extends DocComponent<FieldViewProps, DragDocument>(DragDocument) {
    _downX: number = 0;
    _downY: number = 0;
    public static LayoutString() { return FieldView.LayoutString(DragBox); }
    _mainCont = React.createRef<HTMLDivElement>();
    onDragStart = (e: React.PointerEvent) => {
        if (!e.ctrlKey && !e.altKey && !e.shiftKey && !this.props.isSelected() && e.button === 0) {
            document.removeEventListener("pointermove", this.onDragMove);
            document.addEventListener("pointermove", this.onDragMove);
            document.removeEventListener("pointerup", this.onDragUp);
            document.addEventListener("pointerup", this.onDragUp);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    onDragMove = async (e: MouseEvent) => {
        if (!e.cancelBubble && (Math.abs(this._downX - e.clientX) > 5 || Math.abs(this._downY - e.clientY) > 5)) {
            document.removeEventListener("pointermove", this.onDragMove);
            document.removeEventListener("pointerup", this.onDragUp);
            const onDragStart = this.Document.onDragStart;
            e.stopPropagation();
            e.preventDefault();
            let dragData = new DragManager.DocumentDragData([this.props.Document]);
            const factory = await Cast(this.props.Document.factory, Doc);// if there's a factory Doc that is being copied, make sure it's not pending.
            dragData.removeDropProperties = factory ? Cast(factory.removeDropProperties, listSpec("string"), []) : [];
            DragManager.StartDocumentDrag([this._mainCont.current!], dragData, e.clientX, e.clientY, {
                finishDrag: async (dropData) => {
                    let res = onDragStart && onDragStart.script.run({ this: this.props.Document }).result;
                    let doc = (res as Doc) || Docs.Create.FreeformDocument([], { nativeWidth: undefined, nativeHeight: undefined, width: 150, height: 100, title: "freeform" });
                    dropData.droppedDocuments = [doc];
                    dragData.removeDropProperties.map(prop => dropData.droppedDocuments.map((d: Doc) => d[prop] = undefined));
                },
                handlers: { dragComplete: emptyFunction },
                hideSource: false
            });
        }
        e.stopPropagation();
        e.preventDefault();
    }

    onDragUp = (e: MouseEvent) => {
        document.removeEventListener("pointermove", this.onDragMove);
        document.removeEventListener("pointerup", this.onDragUp);
    }

    onContextMenu = () => {
        let funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Set Make Aliases", icon: "edit", event: () => this.props.Document.factory && (this.props.Document.onDragStart = ScriptField.MakeFunction('getAlias(this.factory)')) });
        funcs.push({ description: "Set Make Copies", icon: "edit", event: () => this.props.Document.factory && (this.props.Document.onDragStart = ScriptField.MakeFunction('getCopy(this.factory, true)')) });
        funcs.push({
            description: "Edit OnClick script", icon: "edit", event: () => {
                let overlayDisposer: () => void = emptyFunction;
                const script = this.Document.onDragStart;
                let originalText: string | undefined = undefined;
                if (script) originalText = script.script.originalScript;
                // tslint:disable-next-line: no-unnecessary-callback-wrapper
                let scriptingBox = <ScriptBox initialText={originalText} onCancel={() => overlayDisposer()} onSave={(text, onError) => {
                    const script = CompileScript(text, {
                        params: { this: Doc.name },
                        typecheck: false,
                        editable: true,
                        transformer: DocumentIconContainer.getTransformer()
                    });
                    if (!script.compiled) {
                        onError(script.errors.map(error => error.messageText).join("\n"));
                        return;
                    }
                    this.Document.onClick = new ScriptField(script);
                    overlayDisposer();
                }} showDocumentIcons />;
                overlayDisposer = OverlayView.Instance.addWindow(scriptingBox, { x: 400, y: 200, width: 500, height: 400, title: `${this.Document.title || ""} OnDragStart` });
            }
        });
        ContextMenu.Instance.addItem({ description: "DragBox Funcs...", subitems: funcs, icon: "asterisk" });
    }

    render() {
        return (<div className="dragBox-outerDiv" onContextMenu={this.onContextMenu} onPointerDown={this.onDragStart} ref={this._mainCont}>
            <FontAwesomeIcon className="dragBox-icon" icon={this.props.Document.icon as any} size="lg" color="white" />
        </div>);
    }
}