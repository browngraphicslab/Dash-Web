import { action, configure, observable, ObservableMap, Lambda } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observer } from 'mobx-react';

// configure({
//     enforceActions: "observed"
// });

// @observer
// class FieldViewer extends React.Component<{ field: BasicField<any> }> {
//     render() {
//         return <span>{JSON.stringify(this.props.field.Data)} ({this.props.field.Id})</span>;
//     }
// }

// @observer
// class KeyViewer extends React.Component<{ field: Key }> {
//     render() {
//         return this.props.field.Name;
//     }
// }

// @observer
// class ListViewer extends React.Component<{ field: ListField<Field> }>{
//     @observable
//     expanded = false;

//     render() {
//         let content;
//         if (this.expanded) {
//             content = (
//                 <div>
//                     {this.props.field.Data.map(field => <DebugViewer fieldId={field.Id} key={field.Id} />)}
//                 </div>
//             );
//         } else {
//             content = <>[...] ({this.props.field.Id})</>;
//         }
//         return (
//             <div>
//                 <button onClick={action(() => this.expanded = !this.expanded)}>Toggle</button>
//                 {content}
//             </div >
//         );
//     }
// }

// @observer
// class DocumentViewer extends React.Component<{ field: Document }> {
//     private keyMap: ObservableMap<string, Key> = new ObservableMap;

//     private disposer?: Lambda;

//     componentDidMount() {
//         let f = () => {
//             Array.from(this.props.field._proxies.keys()).forEach(id => {
//                 if (!this.keyMap.has(id)) {
//                     Server.GetField(id, (field) => {
//                         if (field && field instanceof Key) {
//                             this.keyMap.set(id, field);
//                         }
//                     });
//                 }
//             });
//         };
//         this.disposer = this.props.field._proxies.observe(f);
//         f();
//     }

//     componentWillUnmount() {
//         if (this.disposer) {
//             this.disposer();
//         }
//     }

//     render() {
//         let fields = Array.from(this.props.field._proxies.entries()).map(kv => {
//             let key = this.keyMap.get(kv[0]);
//             return (
//                 <div key={kv[0]}>
//                     <b>({key ? key.Name : kv[0]}): </b>
//                     <DebugViewer fieldId={kv[1]}></DebugViewer>
//                 </div>
//             );
//         });
//         return (
//             <div>
//                 Document ({this.props.field.Id})
//                 <div style={{ paddingLeft: "25px" }}>
//                     {fields}
//                 </div>
//             </div>
//         );
//     }
// }

// @observer
// class DebugViewer extends React.Component<{ fieldId: string }> {
//     @observable
//     private field?: Field;

//     @observable
//     private error?: string;

//     constructor(props: { fieldId: string }) {
//         super(props);
//         this.update();
//     }

//     update() {
//         Server.GetField(this.props.fieldId, action((field: Opt<Field>) => {
//             this.field = field;
//             if (!field) {
//                 this.error = `Field with id ${this.props.fieldId} not found`;
//             }
//         }));

//     }

//     render() {
//         let content;
//         if (this.field) {
//             // content = this.field.ToJson();
//             if (this.field instanceof ListField) {
//                 content = (<ListViewer field={this.field} />);
//             } else if (this.field instanceof Document) {
//                 content = (<DocumentViewer field={this.field} />);
//             } else if (this.field instanceof BasicField) {
//                 content = (<FieldViewer field={this.field} />);
//             } else if (this.field instanceof Key) {
//                 content = (<KeyViewer field={this.field} />);
//             } else {
//                 content = (<span>Unrecognized field type</span>);
//             }
//         } else if (this.error) {
//             content = <span>Field <b>{this.props.fieldId}</b> not found <button onClick={() => this.update()}>Refresh</button></span>;
//         } else {
//             content = <span>Field loading: {this.props.fieldId}</span>;
//         }
//         return content;
//     }
// }

// @observer
// class Viewer extends React.Component {
//     @observable
//     private idToAdd: string = '';

//     @observable
//     private ids: string[] = [];

//     @action
//     inputOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         this.idToAdd = e.target.value;
//     }

//     @action
//     onKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
//         if (e.key === "Enter") {
//             this.ids.push(this.idToAdd);
//             this.idToAdd = "";
//         }
//     }

//     render() {
//         return (
//             <>
//                 <input value={this.idToAdd}
//                     onChange={this.inputOnChange}
//                     onKeyDown={this.onKeyPress} />
//                 <div>
//                     {this.ids.map(id => <DebugViewer fieldId={id} key={id}></DebugViewer>)}
//                 </div>
//             </>
//         );
//     }
// }

// ReactDOM.render((
//     <div style={{ position: "absolute", width: "100%", height: "100%" }}>
//         <Viewer />
//     </div>),
//     document.getElementById('root')
// );