import {Component,Suspense,type ReactNode} from 'react';
import './lazy-panel.css';

interface Props {children:ReactNode;fallback:ReactNode;resetKey:string;onDismiss?:()=>void;dismissLabel?:string}
interface State {failed:boolean;resetKey:string}

/** Keep a failed page chunk inside its panel; recovery never replays application work. */
export class LazyPanel extends Component<Props,State>{
 state:State={failed:false,resetKey:this.props.resetKey};
 static getDerivedStateFromError(){return {failed:true};}
 static getDerivedStateFromProps(props:Props,state:State){return props.resetKey===state.resetKey?null:{failed:false,resetKey:props.resetKey};}
 render(){
  if(!this.state.failed)return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>;
  return <section className="panel lazy-panel-error" role="alert">
   <h1>This page could not be loaded</h1>
   <p>The workspace may have been updated, or the connection was interrupted. Use the navigation above to continue, or reload when you are ready.</p>
   <p>Review any unsaved work before reloading.</p>
   <div className="lazy-panel-actions">
    <button className="primary-button" onClick={()=>window.location.reload()}>Reload workspace</button>
    {this.props.onDismiss&&<button onClick={this.props.onDismiss}>{this.props.dismissLabel??'Close'}</button>}
   </div>
  </section>;
 }
}
